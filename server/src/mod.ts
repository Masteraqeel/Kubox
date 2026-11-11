import type { Hono } from 'hono';
import { removePost } from './forum.ts';
import { HttpError, intParam, json, need, needMod, str } from './util.ts';
import type { Env, Limit, Options } from './util.ts';

export function modRoutes(app: Hono<Env>, { db }: Options, limit: Limit) {
  app.post('/api/reports', async c => {
    const u = need(c); limit('report:' + u.id, 10, 600_000);
    const b = await json(c), kind = b.kind === 'post' ? 'post' : b.kind === 'wall' ? 'wall' : null;
    if (!kind) throw new HttpError(400, 'You can report forum posts and wall posts.');
    const target = intParam(String(b.targetId), 'target'), reason = str(b, 'reason', 3, 300, 'Reason');
    const found = await db.query(`select 1 from ${kind === 'post' ? 'posts' : 'group_wall'} where id = $1 and not deleted`, [target]);
    if (!found.rows.length) throw new HttpError(404, 'That content does not exist.');
    await db.query('insert into reports (reporter_id, kind, target_id, reason) values ($1,$2,$3,$4)', [u.id, kind, target, reason]);
    return c.json({ ok: true }, 201);
  });

  app.get('/api/mod/reports', async c => {
    needMod(c);
    const r = await db.query(`select r.id, r.kind, r.target_id, r.reason, r.created_at, ru.username as reporter,
        coalesce(p.body, w.body) as body, coalesce(pu.username, wu.username) as author, p.thread_id, g.slug as group_slug
      from reports r join users ru on ru.id = r.reporter_id
      left join posts p on r.kind = 'post' and p.id = r.target_id left join users pu on pu.id = p.author_id
      left join group_wall w on r.kind = 'wall' and w.id = r.target_id left join users wu on wu.id = w.author_id
      left join kgroups g on g.id = w.group_id
      where not r.resolved order by r.id limit 100`);
    return c.json({ reports: r.rows });
  });

  app.post('/api/mod/reports/:id/resolve', async c => {
    needMod(c);
    const id = intParam(c.req.param('id'), 'report'), b = await json(c);
    const r = await db.query('update reports set resolved = true where id = $1 returning kind, target_id', [id]);
    if (!r.rows[0]) throw new HttpError(404, 'No such report.');
    if (b.remove === true) {
      if (r.rows[0].kind === 'post') await removePost(db, r.rows[0].target_id);
      else await db.query('update group_wall set deleted = true where id = $1', [r.rows[0].target_id]);
      await db.query('update reports set resolved = true where kind = $1 and target_id = $2', [r.rows[0].kind, r.rows[0].target_id]);
    }
    return c.json({ ok: true });
  });

  // Banning also ends every session the account has. Admins cannot be banned; only admins can ban moderators.
  app.post('/api/mod/users/:name/ban', async c => {
    const me = needMod(c), banned = (await json(c)).banned !== false;
    const t = await db.query('select id, role from users where username_lower = $1', [c.req.param('name').toLowerCase()]);
    if (!t.rows[0]) throw new HttpError(404, 'No such user.');
    if (t.rows[0].role === 'admin' || (t.rows[0].role === 'mod' && me.role !== 'admin')) throw new HttpError(403, 'You cannot ban that account.');
    await db.query('update users set banned = $1 where id = $2', [banned, t.rows[0].id]);
    if (banned) await db.query('delete from sessions where user_id = $1', [t.rows[0].id]);
    return c.json({ ok: true, banned });
  });

  app.post('/api/mod/users/:name/role', async c => {
    const me = need(c);
    if (me.role !== 'admin') throw new HttpError(403, 'Admins only.');
    const role = (await json(c)).role;
    if (role !== 'member' && role !== 'mod') throw new HttpError(400, 'Role must be member or mod.');
    const r = await db.query(`update users set role = $1 where username_lower = $2 and role <> 'admin' returning id`, [role, c.req.param('name').toLowerCase()]);
    if (!r.rows.length) throw new HttpError(404, 'No such user, or the user is an admin.');
    return c.json({ ok: true });
  });
}
