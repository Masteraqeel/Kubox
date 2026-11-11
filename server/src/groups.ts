import type { Hono } from 'hono';
import type { Q } from './db.ts';
import { HttpError, hex, intParam, isMod, isUnique, json, need, pub, str } from './util.ts';
import type { Ctx, Env, Limit, Options } from './util.ts';

// Rank levels: 255 is the owner. 200 and above are officers, who can shout, post events and manage lower ranks.
const OWNER = 255, OFFICER = 200;
const card = (g: any) => ({ slug: g.slug, name: g.name, tag: g.tag, color: g.color, color2: g.color2 });

export function groupRoutes(app: Hono<Env>, { db }: Options, limit: Limit) {
  async function load(c: Ctx) {
    const g = await db.query('select * from kgroups where slug = $1', [c.req.param('slug')]);
    if (!g.rows[0]) throw new HttpError(404, 'No such group.');
    return g.rows[0];
  }
  async function membership(q: Q, groupId: number, userId: number) {
    const r = await q.query(`select m.rank_id, r.level, r.name from group_members m join group_ranks r on r.id = m.rank_id where m.group_id = $1 and m.user_id = $2`, [groupId, userId]);
    return (r.rows[0] as { rank_id: number; level: number; name: string } | undefined) ?? null;
  }
  async function officer(c: Ctx, min = OFFICER) {
    const u = need(c), g = await load(c), m = await membership(db, g.id, u.id);
    if (!m || m.level < min) throw new HttpError(403, min === OWNER ? 'Only the group owner can do that.' : 'Only officers of this group can do that.');
    return { u, g, m };
  }
  async function target(g: any, name: string) {
    const r = await db.query(`select u.id, u.username, r.level from users u join group_members m on m.user_id = u.id and m.group_id = $1
      join group_ranks r on r.id = m.rank_id where u.username_lower = $2`, [g.id, name.toLowerCase()]);
    if (!r.rows[0]) throw new HttpError(404, 'That player is not in this group.');
    return r.rows[0] as { id: number; username: string; level: number };
  }

  app.get('/api/groups', async c => {
    const u = c.get('user');
    const r = await db.query(`select g.slug, g.name, g.tag, g.color, g.color2, g.description, o.username as owner,
        (select count(*)::int from group_members m where m.group_id = g.id) as members,
        (select count(*)::int from group_relations x where (x.group_id = g.id or x.other_id = g.id) and x.kind = 'ally' and x.status = 'accepted') as allies,
        (select count(*)::int from group_relations x where (x.group_id = g.id or x.other_id = g.id) and x.kind = 'enemy') as enemies
      from kgroups g join users o on o.id = g.owner_id order by members desc, g.id limit 200`);
    const mine = u ? (await db.query('select g.slug from group_members m join kgroups g on g.id = m.group_id where m.user_id = $1', [u.id])).rows.map(x => x.slug) : [];
    return c.json({ groups: r.rows, mine });
  });

  app.post('/api/groups', async c => {
    const u = need(c); limit('group:' + u.id, 3, 3600_000);
    const b = await json(c), name = str(b, 'name', 3, 40, 'Name'), tag = str(b, 'tag', 2, 4, 'Tag').toUpperCase();
    if (!/^[A-Z0-9]+$/.test(tag)) throw new HttpError(400, 'Tag must be 2 to 4 letters or digits.');
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (slug.length < 3) throw new HttpError(400, 'Name needs at least three letters or digits.');
    const description = typeof b.description === 'string' ? b.description.trim().slice(0, 500) : '';
    const color = hex(b, 'color', 'Colour'), color2 = hex(b, 'color2', 'Second colour');
    const owned = await db.query('select count(*)::int as n from kgroups where owner_id = $1', [u.id]);
    if (owned.rows[0].n >= 3) throw new HttpError(403, 'You can own at most three groups.');
    try {
      await db.tx(async q => {
        const g = await q.query('insert into kgroups (slug, name, tag, description, color, color2, owner_id) values ($1,$2,$3,$4,$5,$6,$7) returning id', [slug, name, tag, description, color, color2, u.id]);
        const id = g.rows[0].id;
        let ownerRank = 0;
        for (const [rank, level] of [['Owner', OWNER], ['Officer', OFFICER], ['Member', 100], ['Recruit', 1]] as const) {
          const r = await q.query('insert into group_ranks (group_id, name, level) values ($1,$2,$3) returning id', [id, rank, level]);
          if (level === OWNER) ownerRank = r.rows[0].id;
        }
        await q.query('insert into group_members (group_id, user_id, rank_id) values ($1,$2,$3)', [id, u.id, ownerRank]);
      });
    } catch (e) {
      if (isUnique(e)) throw new HttpError(409, 'A group with that name already exists.');
      throw e;
    }
    return c.json({ slug }, 201);
  });

  app.get('/api/groups/:slug', async c => {
    const g = await load(c), u = c.get('user');
    const [owner, ranks, roster, wall, events, rel, shouter] = await Promise.all([
      db.query('select username, colors from users where id = $1', [g.owner_id]),
      db.query(`select r.id, r.name, r.level, (select count(*)::int from group_members m where m.rank_id = r.id) as members from group_ranks r where r.group_id = $1 order by r.level desc`, [g.id]),
      db.query(`select u.username, u.colors, r.name as rank, r.level from group_members m join users u on u.id = m.user_id join group_ranks r on r.id = m.rank_id
        where m.group_id = $1 order by r.level desc, m.joined_at limit 60`, [g.id]),
      db.query(`select w.id, w.body, w.created_at, u.username, u.colors from group_wall w join users u on u.id = w.author_id where w.group_id = $1 and not w.deleted order by w.id desc limit 40`, [g.id]),
      db.query(`select id, title, place, starts_at from group_events where group_id = $1 and starts_at > now() - interval '3 hours' order by starts_at limit 20`, [g.id]),
      db.query(`select x.kind, x.status, x.other_id, o.slug, o.name, o.tag, o.color, o.color2 from group_relations x
        join kgroups o on o.id = case when x.group_id = $1 then x.other_id else x.group_id end where x.group_id = $1 or x.other_id = $1`, [g.id]),
      g.shout_by ? db.query('select username, colors from users where id = $1', [g.shout_by]) : Promise.resolve({ rows: [] as any[] })
    ]);
    const me = u ? await membership(db, g.id, u.id) : null;
    return c.json({
      ...card(g), description: g.description, created: g.created_at,
      owner: pub(owner.rows[0].username, owner.rows[0].colors),
      members: ranks.rows.reduce((a, r) => a + r.members, 0),
      shout: g.shout && shouter.rows[0] ? { body: g.shout, at: g.shout_at, by: pub(shouter.rows[0].username, shouter.rows[0].colors) } : null,
      ranks: ranks.rows,
      roster: roster.rows.map(m => ({ ...pub(m.username, m.colors), rank: m.rank, level: m.level })),
      wall: wall.rows.map(w => ({ id: w.id, body: w.body, created: w.created_at, author: pub(w.username, w.colors) })),
      events: events.rows.map(e => ({ id: e.id, title: e.title, place: e.place, startsAt: e.starts_at })),
      // incoming is true when the other group started the relation, so this group is the one that can accept an ally request.
      relations: rel.rows.map(x => ({ kind: x.kind, status: x.status, incoming: x.other_id === g.id, group: card(x) })),
      me: me ? { rank: me.name, level: me.level } : null
    });
  });

  app.post('/api/groups/:slug/join', async c => {
    const u = need(c), g = await load(c);
    if (await membership(db, g.id, u.id)) throw new HttpError(409, 'You are already in this group.');
    const n = await db.query('select count(*)::int as n from group_members where user_id = $1', [u.id]);
    if (n.rows[0].n >= 20) throw new HttpError(403, 'You can be in at most 20 groups.');
    await db.query(`insert into group_members (group_id, user_id, rank_id) select $1, $2, id from group_ranks where group_id = $1 order by level limit 1`, [g.id, u.id]);
    return c.json({ ok: true });
  });

  app.post('/api/groups/:slug/leave', async c => {
    const u = need(c), g = await load(c), m = await membership(db, g.id, u.id);
    if (!m) throw new HttpError(409, 'You are not in this group.');
    if (m.level === OWNER) throw new HttpError(403, 'The owner cannot leave the group.');
    await db.query('delete from group_members where group_id = $1 and user_id = $2', [g.id, u.id]);
    return c.json({ ok: true });
  });

  app.post('/api/groups/:slug/shout', async c => {
    const { u, g } = await officer(c);
    const body = String((await json(c)).body ?? '').trim().slice(0, 300);
    await db.query('update kgroups set shout = $1, shout_by = $2, shout_at = now() where id = $3', [body, u.id, g.id]);
    return c.json({ ok: true });
  });

  app.post('/api/groups/:slug/wall', async c => {
    const u = need(c); limit('wall:' + u.id, 20, 600_000);
    const g = await load(c), body = str(await json(c), 'body', 1, 300, 'Message');
    if (!(await membership(db, g.id, u.id))) throw new HttpError(403, 'Join the group to post on its wall.');
    const r = await db.query('insert into group_wall (group_id, author_id, body) values ($1,$2,$3) returning id', [g.id, u.id, body]);
    return c.json({ id: r.rows[0].id }, 201);
  });

  // Wall posts can be removed by their author, by group officers, or by site moderators.
  app.delete('/api/wall/:id', async c => {
    const u = need(c), id = intParam(c.req.param('id'), 'wall post');
    const w = await db.query('select author_id, group_id from group_wall where id = $1 and not deleted', [id]);
    if (!w.rows[0]) throw new HttpError(404, 'That wall post does not exist.');
    const m = await membership(db, w.rows[0].group_id, u.id);
    if (w.rows[0].author_id !== u.id && !isMod(u) && !(m && m.level >= OFFICER)) throw new HttpError(403, 'You cannot remove that wall post.');
    await db.query('update group_wall set deleted = true where id = $1', [id]);
    return c.json({ ok: true });
  });

  app.post('/api/groups/:slug/events', async c => {
    const { u, g } = await officer(c);
    const b = await json(c), title = str(b, 'title', 3, 80, 'Title'), place = String(b.place ?? '').trim().slice(0, 80), when = new Date(String(b.startsAt));
    if (Number.isNaN(when.getTime())) throw new HttpError(400, 'Enter a valid start time.');
    const r = await db.query('insert into group_events (group_id, title, place, starts_at, created_by) values ($1,$2,$3,$4,$5) returning id', [g.id, title, place, when.toISOString(), u.id]);
    return c.json({ id: r.rows[0].id }, 201);
  });

  app.post('/api/groups/:slug/ranks', async c => {
    const { g } = await officer(c, OWNER);
    const b = await json(c), name = str(b, 'name', 2, 30, 'Rank name'), level = Number(b.level);
    if (!Number.isInteger(level) || level < 2 || level > 254) throw new HttpError(400, 'Level must be a whole number from 2 to 254.');
    try {
      const r = await db.query('insert into group_ranks (group_id, name, level) values ($1,$2,$3) returning id', [g.id, name, level]);
      return c.json({ id: r.rows[0].id }, 201);
    } catch (e) {
      if (isUnique(e)) throw new HttpError(409, 'A rank with that level already exists.');
      throw e;
    }
  });

  // Officers can move or kick members ranked below them, and can only hand out ranks below their own.
  app.post('/api/groups/:slug/members/:name/rank', async c => {
    const { g, m } = await officer(c);
    const t = await target(g, c.req.param('name')), rankId = intParam(String((await json(c)).rankId), 'rank');
    const rank = await db.query('select id, level from group_ranks where id = $1 and group_id = $2', [rankId, g.id]);
    if (!rank.rows[0]) throw new HttpError(404, 'No such rank in this group.');
    if (t.level >= m.level || rank.rows[0].level >= m.level) throw new HttpError(403, 'You can only manage ranks below your own.');
    await db.query('update group_members set rank_id = $1 where group_id = $2 and user_id = $3', [rankId, g.id, t.id]);
    return c.json({ ok: true });
  });

  app.delete('/api/groups/:slug/members/:name', async c => {
    const { g, m } = await officer(c);
    const t = await target(g, c.req.param('name'));
    if (t.level >= m.level) throw new HttpError(403, 'You can only kick members ranked below you.');
    await db.query('delete from group_members where group_id = $1 and user_id = $2', [g.id, t.id]);
    return c.json({ ok: true });
  });

  // Enemies are declared by one side and show for both. Allies need the other owner to accept.
  app.post('/api/groups/:slug/relations', async c => {
    const { g } = await officer(c, OWNER);
    const b = await json(c), kind = b.kind === 'ally' ? 'ally' : b.kind === 'enemy' ? 'enemy' : null;
    if (!kind) throw new HttpError(400, 'Kind must be ally or enemy.');
    const o = await db.query('select id from kgroups where slug = $1', [String(b.other ?? '')]);
    if (!o.rows[0]) throw new HttpError(404, 'No such group.');
    if (o.rows[0].id === g.id) throw new HttpError(400, 'A group cannot have a relation with itself.');
    await db.tx(async q => {
      await q.query('delete from group_relations where (group_id = $1 and other_id = $2) or (group_id = $2 and other_id = $1)', [g.id, o.rows[0].id]);
      await q.query('insert into group_relations (group_id, other_id, kind, status) values ($1,$2,$3,$4)', [g.id, o.rows[0].id, kind, kind === 'ally' ? 'pending' : 'accepted']);
    });
    return c.json({ ok: true, status: kind === 'ally' ? 'pending' : 'accepted' }, 201);
  });

  app.post('/api/groups/:slug/relations/:other/accept', async c => {
    const { g } = await officer(c, OWNER);
    const r = await db.query(`update group_relations x set status = 'accepted' from kgroups o
      where o.slug = $2 and x.group_id = o.id and x.other_id = $1 and x.kind = 'ally' and x.status = 'pending' returning x.group_id`, [g.id, c.req.param('other')]);
    if (!r.rows.length) throw new HttpError(404, 'There is no pending ally request from that group.');
    return c.json({ ok: true });
  });

  app.delete('/api/groups/:slug/relations/:other', async c => {
    const { g } = await officer(c, OWNER);
    await db.query(`delete from group_relations x using kgroups o where o.slug = $2 and ((x.group_id = $1 and x.other_id = o.id) or (x.group_id = o.id and x.other_id = $1))`, [g.id, c.req.param('other')]);
    return c.json({ ok: true });
  });

  // Home feed: shouts and events from the player's groups.
  app.get('/api/feed', async c => {
    const u = need(c);
    const shouts = await db.query(`select g.slug, g.name, g.tag, g.color, g.color2, g.shout, g.shout_at, s.username from group_members m
      join kgroups g on g.id = m.group_id left join users s on s.id = g.shout_by where m.user_id = $1 and g.shout <> '' order by g.shout_at desc limit 10`, [u.id]);
    const events = await db.query(`select e.title, e.place, e.starts_at, g.slug, g.name from group_events e join kgroups g on g.id = e.group_id
      join group_members m on m.group_id = g.id and m.user_id = $1 where e.starts_at > now() - interval '3 hours' order by e.starts_at limit 10`, [u.id]);
    return c.json({
      shouts: shouts.rows.map(s => ({ group: card(s), body: s.shout, at: s.shout_at, by: s.username })),
      events: events.rows.map(e => ({ title: e.title, place: e.place, startsAt: e.starts_at, group: { slug: e.slug, name: e.name } }))
    });
  });
}
