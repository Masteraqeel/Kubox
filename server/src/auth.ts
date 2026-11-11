import type { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import type { Q } from './db.ts';
import { HttpError, HEX, checkPassword, hashPassword, ip, isUnique, json, need, newToken, pub, sha, str } from './util.ts';
import type { Ctx, Env, Limit, Options } from './util.ts';

const COOKIE = 'kbx', DAYS = 30;
const FREE_HATS: string[] = createRequire(import.meta.url)('../../js/sim.js').FREE_HATS;
const USERNAME = /^[A-Za-z0-9]{3,20}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createUser(q: Q, f: { username: string; email: string; password: string; role?: string; invite?: string | null }) {
  const r = await q.query<{ id: number }>(
    `insert into users (username, username_lower, email, pw_hash, role, invite_code, adult_confirmed_at) values ($1,$2,$3,$4,$5,$6, now()) returning id`,
    [f.username, f.username.toLowerCase(), f.email.toLowerCase(), await hashPassword(f.password), f.role ?? 'member', f.invite ?? null]);
  return r.rows[0].id;
}

export function authRoutes(app: Hono<Env>, o: Options, limit: Limit) {
  const { db } = o;

  async function startSession(c: Ctx, userId: number) {
    const token = newToken();
    await db.query(`insert into sessions (token_hash, user_id, expires_at) values ($1,$2, now() + interval '${DAYS} days')`, [sha(token), userId]);
    setCookie(c, COOKIE, token, { httpOnly: true, sameSite: 'Lax', secure: o.secureCookies, path: '/', maxAge: DAYS * 86400 });
  }

  // Every API request: require the custom header on writes (blocks cross-site form posts) and load the session.
  app.use('/api/*', async (c, next) => {
    if (c.req.method !== 'GET' && c.req.header('x-kubox') !== '1') throw new HttpError(403, 'Missing X-Kubox header.');
    const token = getCookie(c, COOKIE);
    let user = null;
    if (token) {
      const r = await db.query(`select u.id, u.username, u.role, u.colors, u.banned from sessions s join users u on u.id = s.user_id where s.token_hash = $1 and s.expires_at > now()`, [sha(token)]);
      if (r.rows[0] && !r.rows[0].banned) user = r.rows[0];
    }
    c.set('user', user);
    await next();
  });

  app.get('/api/me', c => {
    const u = c.get('user');
    return c.json({ kubox: true, user: u ? { ...pub(u.username, u.colors), role: u.role } : null });
  });

  app.post('/api/register', async c => {
    limit('reg:' + ip(c), 10, 3600_000);
    const b = await json(c);
    const username = str(b, 'username', 3, 20, 'Username');
    if (!USERNAME.test(username)) throw new HttpError(400, 'Username must be 3 to 20 letters and digits, with no spaces or symbols.');
    const email = str(b, 'email', 3, 200, 'Email');
    if (!EMAIL.test(email)) throw new HttpError(400, 'Enter a valid email address.');
    const password = typeof b.password === 'string' ? b.password : '';
    if (password.length < 8 || password.length > 200) throw new HttpError(400, 'Password must be 8 to 200 characters.');
    if (b.adult !== true) throw new HttpError(400, 'Kubox is for adults only. Confirm that you are 18 or older.');
    const invite = str(b, 'invite', 1, 64, 'Invite code').toUpperCase();
    try {
      const id = await db.tx(async q => {
        const used = await q.query(`update invites set uses = uses + 1 where code = $1 and uses < max_uses returning code`, [invite]);
        if (!used.rows.length) throw new HttpError(400, 'That invite code is not valid or has been used up.');
        return createUser(q, { username, email, password, invite });
      });
      await startSession(c, id);
      return c.json({ user: pub(username, '#f5b800,#2b6fd9,#1d2b4f') }, 201);
    } catch (e) {
      if (isUnique(e)) throw new HttpError(409, 'That username or email is already registered.');
      throw e;
    }
  });

  app.post('/api/login', async c => {
    const b = await json(c);
    const login = str(b, 'login', 1, 200, 'Username or email').toLowerCase();
    limit('login:' + ip(c) + ':' + login, 10, 900_000);
    const r = await db.query(`select id, username, colors, role, pw_hash, banned from users where username_lower = $1 or email = $1`, [login]);
    const u = r.rows[0];
    const ok = u ? await checkPassword(String(b.password ?? ''), u.pw_hash) : false;
    if (!ok) throw new HttpError(401, 'Wrong username or password.');
    if (u.banned) throw new HttpError(403, 'This account is banned.');
    await startSession(c, u.id);
    return c.json({ user: { ...pub(u.username, u.colors), role: u.role } });
  });

  app.post('/api/logout', async c => {
    const token = getCookie(c, COOKIE);
    if (token) await db.query('delete from sessions where token_hash = $1', [sha(token)]);
    deleteCookie(c, COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  app.patch('/api/me', async c => {
    const u = need(c), b = await json(c);
    if (typeof b.blurb === 'string') await db.query('update users set blurb = $1 where id = $2', [b.blurb.trim().slice(0, 300), u.id]);
    if (Array.isArray(b.colors) || typeof b.hat === 'string') {
      const now = pub(u.username, u.colors);
      let colors = now.colors, hat = now.hat;
      if (Array.isArray(b.colors)) {
        if (b.colors.length !== 3 || !b.colors.every((x: unknown) => typeof x === 'string' && HEX.test(x))) throw new HttpError(400, 'Pick three colours.');
        colors = b.colors.map((x: string) => x.toLowerCase());
      }
      if (typeof b.hat === 'string') {
        // Only free hats for now: item ownership is not tracked by the server until the economy is built.
        if (b.hat !== '' && !FREE_HATS.includes(b.hat)) throw new HttpError(400, 'You cannot wear that hat yet.');
        hat = b.hat;
      }
      await db.query('update users set colors = $1 where id = $2', [[...colors, ...(hat ? [hat] : [])].join(','), u.id]);
    }
    return c.json({ ok: true });
  });

  app.get('/api/users/:name', async c => {
    const r = await db.query(`select id, username, colors, blurb, role, banned, created_at,
        (select count(*)::int from posts p where p.author_id = users.id and not p.deleted) as posts
      from users where username_lower = $1`, [c.req.param('name').toLowerCase()]);
    const u = r.rows[0];
    if (!u) throw new HttpError(404, 'No such user.');
    const g = await db.query(`select g.slug, g.name, g.tag, g.color, g.color2, r.name as rank from group_members m
      join kgroups g on g.id = m.group_id join group_ranks r on r.id = m.rank_id where m.user_id = $1 order by r.level desc`, [u.id]);
    return c.json({ ...pub(u.username, u.colors), blurb: u.blurb, role: u.role, banned: u.banned, joined: u.created_at, posts: u.posts, groups: g.rows });
  });

  // Invites: members get three, admins are unlimited and can set the number of uses.
  app.get('/api/invites', async c => {
    const u = need(c);
    const r = await db.query('select code, max_uses, uses, created_at from invites where created_by = $1 order by created_at desc', [u.id]);
    return c.json({ invites: r.rows, limit: u.role === 'admin' ? null : 3 });
  });
  app.post('/api/invites', async c => {
    const u = need(c), b = await json(c);
    let uses = 1;
    if (u.role === 'admin') uses = Math.min(1000, Math.max(1, Number(b.maxUses) || 1));
    else {
      const n = await db.query('select count(*)::int as n from invites where created_by = $1', [u.id]);
      if (n.rows[0].n >= 3) throw new HttpError(403, 'You have used all three of your invites.');
    }
    const code = 'KBX-' + randomBytes(5).toString('hex').toUpperCase();
    await db.query('insert into invites (code, created_by, max_uses) values ($1,$2,$3)', [code, u.id, uses]);
    return c.json({ code, max_uses: uses }, 201);
  });
}
