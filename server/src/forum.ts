import type { Hono } from 'hono';
import { HttpError, intParam, isMod, json, need, needMod, page, pub, str } from './util.ts';
import type { Env, Limit, Options } from './util.ts';

const THREADS_PER_PAGE = 25, POSTS_PER_PAGE = 20;

export function forumRoutes(app: Hono<Env>, { db }: Options, limit: Limit) {
  app.get('/api/boards', async c => {
    const boards = await db.query(`select b.id, b.name, b.description,
        (select count(*)::int from threads t where t.board_id = b.id and not t.deleted) as threads,
        (select count(*)::int from posts p join threads t on t.id = p.thread_id where t.board_id = b.id and not p.deleted and not t.deleted) as posts
      from boards b order by b.position`);
    const latest = await db.query(`select distinct on (board_id) board_id, id, title from threads where not deleted order by board_id, last_post_at desc`);
    const byBoard = new Map(latest.rows.map(t => [t.board_id, { id: t.id, title: t.title }]));
    return c.json({ boards: boards.rows.map(b => ({ ...b, latest: byBoard.get(b.id) ?? null })) });
  });

  app.get('/api/boards/:id/threads', async c => {
    const b = await db.query('select id, name, description from boards where id = $1', [c.req.param('id')]);
    if (!b.rows[0]) throw new HttpError(404, 'No such board.');
    const p = page(c);
    const total = await db.query('select count(*)::int as n from threads where board_id = $1 and not deleted', [b.rows[0].id]);
    const r = await db.query(`select t.id, t.title, t.pinned, t.locked, t.views, t.created_at, t.last_post_at,
        u.username, u.colors, lu.username as last_user,
        (select count(*)::int from posts p where p.thread_id = t.id and not p.deleted) - 1 as replies
      from threads t join users u on u.id = t.author_id
      left join lateral (select author_id from posts p where p.thread_id = t.id and not p.deleted order by p.id desc limit 1) lp on true
      left join users lu on lu.id = lp.author_id
      where t.board_id = $1 and not t.deleted
      order by t.pinned desc, t.last_post_at desc limit $2 offset $3`, [b.rows[0].id, THREADS_PER_PAGE, (p - 1) * THREADS_PER_PAGE]);
    return c.json({ board: b.rows[0], page: p, pages: Math.max(1, Math.ceil(total.rows[0].n / THREADS_PER_PAGE)),
      threads: r.rows.map(t => ({ id: t.id, title: t.title, pinned: t.pinned, locked: t.locked, views: t.views, replies: Math.max(0, t.replies),
        created: t.created_at, lastPost: t.last_post_at, lastUser: t.last_user, author: pub(t.username, t.colors) })) });
  });

  app.post('/api/boards/:id/threads', async c => {
    const u = need(c); limit('thread:' + u.id, 5, 600_000);
    const b = await json(c), title = str(b, 'title', 3, 120, 'Title'), body = str(b, 'body', 1, 5000, 'Post');
    const board = await db.query('select id from boards where id = $1', [c.req.param('id')]);
    if (!board.rows[0]) throw new HttpError(404, 'No such board.');
    const id = await db.tx(async q => {
      const t = await q.query('insert into threads (board_id, author_id, title) values ($1,$2,$3) returning id', [board.rows[0].id, u.id, title]);
      await q.query('insert into posts (thread_id, author_id, body) values ($1,$2,$3)', [t.rows[0].id, u.id, body]);
      return t.rows[0].id as number;
    });
    return c.json({ id }, 201);
  });

  app.get('/api/threads/latest', async c => {
    const r = await db.query(`select t.id, t.title, t.last_post_at, b.name as board, lu.username as last_user
      from threads t join boards b on b.id = t.board_id
      left join lateral (select author_id from posts p where p.thread_id = t.id and not p.deleted order by p.id desc limit 1) lp on true
      left join users lu on lu.id = lp.author_id
      where not t.deleted order by t.last_post_at desc limit 8`);
    return c.json({ threads: r.rows });
  });

  app.get('/api/threads/:id', async c => {
    const id = intParam(c.req.param('id'), 'thread');
    const t = await db.query(`select t.id, t.title, t.pinned, t.locked, t.board_id, b.name as board from threads t join boards b on b.id = t.board_id where t.id = $1 and not t.deleted`, [id]);
    if (!t.rows[0]) throw new HttpError(404, 'That thread does not exist or was removed.');
    await db.query('update threads set views = views + 1 where id = $1', [id]);
    const p = page(c);
    const total = await db.query('select count(*)::int as n from posts where thread_id = $1 and not deleted', [id]);
    const r = await db.query(`select p.id, p.body, p.created_at, u.username, u.colors, u.role, u.created_at as joined,
        (select count(*)::int from posts x where x.author_id = u.id and not x.deleted) as posts
      from posts p join users u on u.id = p.author_id where p.thread_id = $1 and not p.deleted order by p.id limit $2 offset $3`, [id, POSTS_PER_PAGE, (p - 1) * POSTS_PER_PAGE]);
    return c.json({ thread: t.rows[0], page: p, pages: Math.max(1, Math.ceil(total.rows[0].n / POSTS_PER_PAGE)),
      posts: r.rows.map(x => ({ id: x.id, body: x.body, created: x.created_at, author: { ...pub(x.username, x.colors), role: x.role, joined: x.joined, posts: x.posts } })) });
  });

  app.post('/api/threads/:id/posts', async c => {
    const u = need(c); limit('post:' + u.id, 20, 600_000);
    const id = intParam(c.req.param('id'), 'thread'), body = str(await json(c), 'body', 1, 5000, 'Reply');
    const t = await db.query('select locked from threads where id = $1 and not deleted', [id]);
    if (!t.rows[0]) throw new HttpError(404, 'That thread does not exist or was removed.');
    if (t.rows[0].locked && !isMod(u)) throw new HttpError(403, 'This thread is locked.');
    const r = await db.tx(async q => {
      const ins = await q.query('insert into posts (thread_id, author_id, body) values ($1,$2,$3) returning id', [id, u.id, body]);
      await q.query('update threads set last_post_at = now() where id = $1', [id]);
      const n = await q.query('select count(*)::int as n from posts where thread_id = $1 and not deleted', [id]);
      return { id: ins.rows[0].id as number, page: Math.ceil(n.rows[0].n / POSTS_PER_PAGE) };
    });
    return c.json(r, 201);
  });

  app.patch('/api/threads/:id', async c => {
    needMod(c);
    const id = intParam(c.req.param('id'), 'thread'), b = await json(c);
    if (typeof b.pinned === 'boolean') await db.query('update threads set pinned = $1 where id = $2', [b.pinned, id]);
    if (typeof b.locked === 'boolean') await db.query('update threads set locked = $1 where id = $2', [b.locked, id]);
    return c.json({ ok: true });
  });

  // Authors can remove their own posts, moderators can remove any. Removing the first post removes the thread.
  app.delete('/api/posts/:id', async c => {
    const u = need(c), id = intParam(c.req.param('id'), 'post');
    const p = await db.query('select author_id, thread_id from posts where id = $1 and not deleted', [id]);
    if (!p.rows[0]) throw new HttpError(404, 'That post does not exist.');
    if (p.rows[0].author_id !== u.id && !isMod(u)) throw new HttpError(403, 'You can only remove your own posts.');
    await removePost(db, id);
    return c.json({ ok: true });
  });
}

export async function removePost(db: Options['db'], id: number) {
  await db.tx(async q => {
    const p = await q.query('update posts set deleted = true where id = $1 returning thread_id', [id]);
    if (!p.rows[0]) return;
    const first = await q.query('select min(id) as id from posts where thread_id = $1', [p.rows[0].thread_id]);
    if (first.rows[0].id === id) await q.query('update threads set deleted = true where id = $1', [p.rows[0].thread_id]);
  });
}
