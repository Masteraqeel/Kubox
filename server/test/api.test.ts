// End-to-end API tests. They run against PGlite (in-memory Postgres), so no database setup is needed.
import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { createApp } from '../src/app.ts';
import { createUser } from '../src/auth.ts';
import { openDb } from '../src/db.ts';
import { migrate } from '../src/schema.ts';

let app: ReturnType<typeof createApp>;

/** A tiny browser: remembers its session cookie and sends the header the API requires on writes. */
function client() {
  let cookie = '';
  return async (method: string, path: string, body?: unknown, headers: Record<string, string> = { 'x-kubox': '1' }) => {
    const res = await app.request(path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: (await res.json().catch(() => null)) as any };
  };
}
const admin = client(), ana = client(), ben = client(), cy = client(), anon = client();
const reg = (username: string, extra: object = {}) => ({ username, email: `${username}@example.com`, password: 'correct horse', invite: 'TEST-INVITE', adult: true, ...extra });

before(async () => {
  // Set TEST_DATABASE_URL to run the same tests against a real, empty Postgres database.
  const db = await openDb(process.env.TEST_DATABASE_URL);
  await migrate(db);
  await createUser(db, { username: 'Founder', email: 'founder@example.com', password: 'admin-password', role: 'admin' });
  await db.query(`insert into invites (code, max_uses) values ('TEST-INVITE', 3)`);
  app = createApp({ db, secureCookies: false, rateLimit: false });
});

test('sign-up needs a valid invite, an 18+ confirmation and a sane username', async () => {
  assert.equal((await ana('POST', '/api/register', reg('ana', { invite: 'WRONG' }))).status, 400);
  assert.equal((await ana('POST', '/api/register', reg('ana', { adult: false }))).status, 400);
  assert.equal((await ana('POST', '/api/register', reg('a b'))).status, 400);
  assert.equal((await ana('POST', '/api/register', reg('ana', { password: 'short' }))).status, 400);
  assert.equal((await ana('POST', '/api/register', reg('ana'))).status, 201);
  assert.equal((await ana('GET', '/api/me')).body.user.username, 'ana');
  assert.equal((await ben('POST', '/api/register', reg('ANA', { email: 'other@example.com' }))).status, 409, 'usernames are unique regardless of case');
  assert.equal((await ben('POST', '/api/register', reg('ben'))).status, 201);
  assert.equal((await cy('POST', '/api/register', reg('cyd'))).status, 201);
  const spent = await anon('POST', '/api/register', reg('dee'));
  assert.equal(spent.status, 400, 'the invite had three uses');
});

test('login, logout and the write-protection header', async () => {
  assert.equal((await anon('POST', '/api/login', { login: 'ana', password: 'nope' })).status, 401);
  assert.equal((await anon('POST', '/api/login', { login: 'ana@example.com', password: 'correct horse' })).status, 200);
  assert.equal((await anon('POST', '/api/logout')).status, 200);
  assert.equal((await anon('GET', '/api/me')).body.user, null);
  assert.equal((await ana('POST', '/api/boards/general/threads', { title: 'x', body: 'y' }, {})).status, 403, 'writes without X-Kubox are refused');
  assert.equal((await admin('POST', '/api/login', { login: 'Founder', password: 'admin-password' })).status, 200);
});

test('forum: threads, replies, pinning, locking and removal', async () => {
  assert.equal((await anon('POST', '/api/boards/general/threads', { title: 'Hello there', body: 'First' })).status, 401);
  assert.equal((await ana('POST', '/api/boards/nope/threads', { title: 'Hello there', body: 'First' })).status, 404);
  const t = await ana('POST', '/api/boards/general/threads', { title: 'Hello there', body: 'First <b>post</b>' });
  assert.equal(t.status, 201);
  const id = t.body.id;
  const reply = await ben('POST', `/api/threads/${id}/posts`, { body: 'Second' });
  assert.equal(reply.status, 201);
  const view = await anon('GET', `/api/threads/${id}`);
  assert.equal(view.body.posts.length, 2);
  assert.equal(view.body.posts[0].body, 'First <b>post</b>', 'bodies are stored as written and escaped by the client');
  assert.equal(view.body.posts[0].author.posts, 1);
  const list = await anon('GET', '/api/boards/general/threads');
  assert.deepEqual([list.body.threads[0].replies, list.body.threads[0].lastUser, list.body.threads[0].author.username], [1, 'ben', 'ana']);
  const boards = await anon('GET', '/api/boards');
  const general = boards.body.boards.find((b: any) => b.id === 'general');
  assert.deepEqual([general.threads, general.posts, general.latest.id], [1, 2, id]);

  assert.equal((await ben('PATCH', `/api/threads/${id}`, { locked: true })).status, 403);
  assert.equal((await admin('PATCH', `/api/threads/${id}`, { locked: true, pinned: true })).status, 200);
  assert.equal((await ben('POST', `/api/threads/${id}/posts`, { body: 'Locked out' })).status, 403);
  assert.equal((await admin('POST', `/api/threads/${id}/posts`, { body: 'Mods can still post' })).status, 201);

  assert.equal((await ben('DELETE', `/api/posts/${view.body.posts[0].id}`)).status, 403, "cannot remove another player's post");
  assert.equal((await ben('DELETE', `/api/posts/${reply.body.id}`)).status, 200);
  assert.equal((await anon('GET', `/api/threads/${id}`)).body.posts.length, 2);
  assert.equal((await ana('DELETE', `/api/posts/${view.body.posts[0].id}`)).status, 200);
  assert.equal((await anon('GET', `/api/threads/${id}`)).status, 404, 'removing the first post removes the thread');
});

test('forum pagination', async () => {
  const t = await ana('POST', '/api/boards/offtopic/threads', { title: 'Count up', body: '1' });
  let last: any;
  for (let i = 2; i <= 21; i++) last = await ana('POST', `/api/threads/${t.body.id}/posts`, { body: String(i) });
  assert.equal(last.body.page, 2);
  const p2 = await anon('GET', `/api/threads/${t.body.id}?page=2`);
  assert.deepEqual([p2.body.pages, p2.body.posts.length, p2.body.posts[0].body], [2, 1, '21']);
});

test('groups: create, join, ranks, wall, shout, events', async () => {
  assert.equal((await ana('POST', '/api/groups', { name: 'Iron Legion', tag: 'IL', color: 'red', color2: '#f5b800' })).status, 400, 'colours must be hex');
  const g = await ana('POST', '/api/groups', { name: 'Iron Legion', tag: 'il', description: 'Discipline first.', color: '#3a5f3a', color2: '#f5b800' });
  assert.deepEqual([g.status, g.body.slug], [201, 'ironlegion']);
  assert.equal((await ben('POST', '/api/groups', { name: 'iron legion', tag: 'IL', color: '#000000', color2: '#ffffff' })).status, 409);

  assert.equal((await ben('POST', '/api/groups/ironlegion/wall', { body: 'hi' })).status, 403, 'only members post on the wall');
  assert.equal((await ben('POST', '/api/groups/ironlegion/join')).status, 200);
  assert.equal((await ben('POST', '/api/groups/ironlegion/join')).status, 409);
  assert.equal((await cy('POST', '/api/groups/ironlegion/join')).status, 200);
  assert.equal((await ben('POST', '/api/groups/ironlegion/wall', { body: 'Reporting for duty.' })).status, 201);
  assert.equal((await ben('POST', '/api/groups/ironlegion/shout', { body: 'I am in charge' })).status, 403);
  assert.equal((await ana('POST', '/api/groups/ironlegion/shout', { body: 'Training at 20:00 UTC.' })).status, 200);
  assert.equal((await ana('POST', '/api/groups/ironlegion/events', { title: 'Training', place: 'Training Facility', startsAt: new Date(Date.now() + 3600_000).toISOString() })).status, 201);
  assert.equal((await ana('POST', '/api/groups/ironlegion/leave')).status, 403, 'the owner cannot leave');

  let view = (await ben('GET', '/api/groups/ironlegion')).body;
  assert.deepEqual([view.members, view.me.rank, view.shout.body, view.wall.length, view.events.length, view.tag], [3, 'Recruit', 'Training at 20:00 UTC.', 1, 1, 'IL']);
  const rank = (name: string) => view.ranks.find((r: any) => r.name === name).id;

  // Promotion rules: only officers, only below their own rank.
  assert.equal((await ben('POST', '/api/groups/ironlegion/members/cyd/rank', { rankId: rank('Member') })).status, 403);
  assert.equal((await ana('POST', '/api/groups/ironlegion/members/ben/rank', { rankId: rank('Owner') })).status, 403, 'cannot hand out the owner rank');
  assert.equal((await ana('POST', '/api/groups/ironlegion/members/ben/rank', { rankId: rank('Officer') })).status, 200);
  assert.equal((await ben('POST', '/api/groups/ironlegion/members/cyd/rank', { rankId: rank('Member') })).status, 200);
  assert.equal((await ben('POST', '/api/groups/ironlegion/members/cyd/rank', { rankId: rank('Officer') })).status, 403, 'officers cannot promote to their own rank');
  assert.equal((await ben('DELETE', '/api/groups/ironlegion/members/ana')).status, 403, 'cannot kick the owner');
  assert.equal((await ben('POST', '/api/groups/ironlegion/ranks', { name: 'Sergeant', level: 150 })).status, 403);
  assert.equal((await ana('POST', '/api/groups/ironlegion/ranks', { name: 'Sergeant', level: 150 })).status, 201);
  assert.equal((await ana('POST', '/api/groups/ironlegion/ranks', { name: 'Dupe', level: 150 })).status, 409);
  assert.equal((await ben('DELETE', '/api/groups/ironlegion/members/cyd')).status, 200);
  view = (await cy('GET', '/api/groups/ironlegion')).body;
  assert.deepEqual([view.members, view.me], [2, null]);

  const feed = (await ben('GET', '/api/feed')).body;
  assert.deepEqual([feed.shouts[0].group.slug, feed.events[0].title], ['ironlegion', 'Training']);
  const profile = (await anon('GET', '/api/users/BEN')).body;
  assert.deepEqual([profile.username, profile.groups[0].rank], ['ben', 'Officer']);
});

test('groups: enemies are one-sided, allies need acceptance', async () => {
  assert.equal((await ben('POST', '/api/groups', { name: 'Vanta Corps', tag: 'VC', color: '#111522', color2: '#d9342b' })).status, 201);
  assert.equal((await cy('POST', '/api/groups', { name: 'Skyline Guild', tag: 'SBG', color: '#2b6fd9', color2: '#f2f2ee' })).status, 201);
  assert.equal((await cy('POST', '/api/groups/vantacorps/relations', { other: 'ironlegion', kind: 'enemy' })).status, 403, 'owners only');
  assert.equal((await ben('POST', '/api/groups/vantacorps/relations', { other: 'vantacorps', kind: 'enemy' })).status, 400);
  assert.equal((await ben('POST', '/api/groups/vantacorps/relations', { other: 'ironlegion', kind: 'enemy' })).status, 201);
  let il = (await anon('GET', '/api/groups/ironlegion')).body;
  assert.deepEqual(il.relations.map((r: any) => [r.kind, r.status, r.incoming, r.group.slug]), [['enemy', 'accepted', true, 'vantacorps']]);

  assert.equal((await cy('POST', '/api/groups/skylineguild/relations', { other: 'ironlegion', kind: 'ally' })).status, 201);
  assert.equal((await cy('POST', '/api/groups/skylineguild/relations/ironlegion/accept')).status, 404, 'the requester cannot accept its own request');
  assert.equal((await ana('POST', '/api/groups/ironlegion/relations/skylineguild/accept')).status, 200);
  const list = (await anon('GET', '/api/groups')).body.groups.find((g: any) => g.slug === 'ironlegion');
  assert.deepEqual([list.allies, list.enemies], [1, 1]);
  assert.equal((await ana('DELETE', '/api/groups/ironlegion/relations/vantacorps')).status, 200);
  il = (await anon('GET', '/api/groups/ironlegion')).body;
  assert.deepEqual(il.relations.map((r: any) => r.kind), ['ally']);
});

test('avatar: colours and free hats are saved, other hats are refused', async () => {
  assert.equal((await ana('PATCH', '/api/me', { colors: ['#111111', '#222222', '#333333'], hat: 'cap' })).status, 200);
  assert.deepEqual((await ana('GET', '/api/me')).body.user, { username: 'ana', colors: ['#111111', '#222222', '#333333'], hat: 'cap', role: 'member' });
  assert.equal((await ana('PATCH', '/api/me', { hat: 'crown' })).status, 400, 'limited hats need ownership, which does not exist yet');
  assert.equal((await ana('PATCH', '/api/me', { colors: ['#111111', 'red', '#333333'] })).status, 400);
  assert.equal((await ana('PATCH', '/api/me', { colors: ['#aaaaaa', '#bbbbbb', '#cccccc'] })).status, 200);
  assert.equal((await anon('GET', '/api/users/ana')).body.hat, 'cap', 'changing colours keeps the hat');
  assert.equal((await ana('PATCH', '/api/me', { hat: '' })).status, 200);
  assert.deepEqual([(await anon('GET', '/api/users/ana')).body.hat, (await anon('GET', '/api/users/ana')).body.colors.length], ['', 3]);
});

test('moderation: reports, removal, bans and invites', async () => {
  const t = await cy('POST', '/api/boards/general/threads', { title: 'Rules', body: 'Be decent.' });
  const bad = await cy('POST', `/api/threads/${t.body.id}/posts`, { body: 'Something rude' });
  assert.equal((await ana('POST', '/api/reports', { kind: 'post', targetId: bad.body.id, reason: 'Rude' })).status, 201);
  assert.equal((await ana('GET', '/api/mod/reports')).status, 403);
  const queue = (await admin('GET', '/api/mod/reports')).body.reports;
  assert.deepEqual([queue.length, queue[0].author, queue[0].body], [1, 'cyd', 'Something rude']);
  assert.equal((await admin('POST', `/api/mod/reports/${queue[0].id}/resolve`, { remove: true })).status, 200);
  assert.equal((await anon('GET', `/api/threads/${t.body.id}`)).body.posts.length, 1);
  assert.equal((await admin('GET', '/api/mod/reports')).body.reports.length, 0);

  assert.equal((await ana('POST', '/api/mod/users/cyd/ban')).status, 403);
  assert.equal((await admin('POST', '/api/mod/users/Founder/ban')).status, 403, 'admins cannot be banned');
  assert.equal((await admin('POST', '/api/mod/users/cyd/ban')).status, 200);
  assert.equal((await cy('GET', '/api/me')).body.user, null, 'a ban ends existing sessions');
  assert.equal((await cy('POST', '/api/login', { login: 'cyd', password: 'correct horse' })).status, 403);

  const codes = [];
  for (let i = 0; i < 3; i++) codes.push((await ana('POST', '/api/invites')).body.code);
  assert.equal((await ana('POST', '/api/invites')).status, 403, 'members get three invites');
  assert.equal((await anon('POST', '/api/register', reg('dee', { invite: codes[0].toLowerCase() }))).status, 201, 'invite codes are not case sensitive');
  assert.equal((await client()('POST', '/api/register', reg('eve', { invite: codes[0] }))).status, 400, 'member invites are single use');
  assert.equal((await admin('POST', '/api/mod/users/dee/role', { role: 'mod' })).status, 200);
  assert.equal((await anon('GET', '/api/mod/reports')).status, 200, 'dee is now a moderator');
});
