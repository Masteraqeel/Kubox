// Simulation tests (no network) and WebSocket tests against a real HTTP server.
import { serve } from '@hono/node-server';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { WebSocket } from 'ws';
import { createApp } from '../src/app.ts';
import { createUser } from '../src/auth.ts';
import { openDb } from '../src/db.ts';
import type { DB } from '../src/db.ts';
import { createGame } from '../src/game.ts';
import { migrate } from '../src/schema.ts';

const Sim = createRequire(import.meta.url)('../../js/sim.js');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** A room with one player whose messages are collected, like an offline client. */
function solo(place: string, opts: object = {}) {
  const got: any[] = [];
  const room = new Sim.Room(place, { ...opts, emit: (_t: number | null, m: any) => got.push(m) });
  const me = room.join({ name: 'ana', colors: ['#111111', '#222222', '#333333'], role: 'member', userId: 7 });
  const of = (t: string) => got.filter(m => m.t === t);
  let seq = 0;
  const run = (steps: number, mx = 0, mz = 0, jump = false) => { for (let i = 0; i < steps; i++) { room.input(me.id, [[++seq, mx, mz, jump]]); room.step(); } };
  return { room, me, got, of, run };
}

test('sim: a player falls to the ground, walks, and cannot exceed walking speed', () => {
  const { room, me, run, of } = solo('sandbox');
  assert.equal(of('welcome').length, 1);
  run(120);
  assert.equal(me.body.grounded, true);
  const z0 = me.body.z;
  run(60, 0, 1);
  assert.ok(Math.abs((me.body.z - z0) - 16) < 0.5, 'one second of walking covers about 16 studs');
  // A cheater sends a huge vector and floods inputs: the vector is clamped and only one input is used per step.
  const z1 = me.body.z, flood = []; for (let i = 0; i < 12; i++) flood.push([1000 + i, 0, 50, false]);
  room.input(me.id, flood); room.input(me.id, flood);
  for (let i = 0; i < 6; i++) room.step();
  assert.ok(me.body.z - z1 < 16 * 6 / 60 + 0.01 && me.body.z > z1, 'no faster than six steps of walking');
});

test('sim: a player who stops sending input stops walking', () => {
  const { room, me, run } = solo('sandbox');
  run(60); run(10, 0, 1);
  for (let i = 0; i < 40; i++) room.step();
  const z = me.body.z;
  for (let i = 0; i < 60; i++) room.step();
  assert.equal(me.body.z, z);
});

test('sim: prediction with the shared step function matches the server exactly', () => {
  const { room, me } = solo('training');
  const mine = Sim.newBody(me.body.x, me.body.y, me.body.z);
  for (let i = 1; i <= 240; i++) {
    const inp = { mx: Math.sin(i / 40), mz: Math.cos(i / 40), jump: i % 50 === 0 };
    Sim.applyInput(room.world, mine, inp); room.input(me.id, [[i, inp.mx, inp.mz, inp.jump]]); room.step();
  }
  assert.deepEqual([mine.x, mine.y, mine.z], [me.body.x, me.body.y, me.body.z]);
});

test('sim: bricks are validated and only their owner or staff can remove them', () => {
  const { room, me, of, run } = solo('sandbox');
  run(60);
  const place = (m: object) => room.action(me.id, { t: 'place', w: 1, h: 1, d: 1, color: Sim.COLORS[0], ...m });
  place({ x: 30, y: 0, z: 30 });
  assert.equal(of('b+').length, 1);
  place({ x: 30, y: 0, z: 30 });                                   // overlaps the brick just placed
  place({ x: 31, y: -1, z: 30 });                                  // below the ground
  place({ x: 500, y: 0, z: 30 });                                  // outside the baseplate
  place({ x: 32.5, y: 0, z: 30 });                                 // off the grid
  place({ x: 33, y: 0, z: 30, w: 9 });                             // not a real brick size
  place({ x: 34, y: 0, z: 30, color: 'url(evil)' });               // not a palette colour
  place({ x: Math.floor(me.body.x), y: 0, z: Math.floor(me.body.z) }); // inside the player
  assert.equal(of('b+').length, 1, 'every invalid placement is ignored');
  const mineId = of('b+')[0].b[0], starter = room.world.bricks[0].id;
  room.action(me.id, { t: 'del', id: starter });
  assert.equal(of('b-').length, 0); assert.match(of('note')[0].text, /only remove bricks you placed/);
  room.action(me.id, { t: 'del', id: mineId });
  assert.equal(of('b-').length, 1);
  me.role = 'mod'; room.action(me.id, { t: 'del', id: starter });
  assert.equal(of('b-').length, 2, 'staff can remove any unlocked brick');
  for (let i = 0; i < 30; i++) place({ x: -40 + i, y: 0, z: 40 });
  assert.ok(of('b+').length < 15, 'placement is rate limited');
});

test('sim: a saved sandbox is restored and bad rows are dropped', () => {
  const a = solo('sandbox'); a.run(30);
  a.room.action(a.me.id, { t: 'place', x: 20, y: 0, z: 20, w: 2, h: 1, d: 2, color: Sim.COLORS[2] });
  const saved = a.room.save();
  const b = new Sim.Room('sandbox', { bricks: [...saved, ['x', 0, 0, 1, 1, 1, '#000000'], [0, 0, 0, 99, 1, 1, Sim.COLORS[0]], [0, 0, 0, 1, 1, 1, 'red']] });
  assert.equal(b.world.bricks.length, saved.length);
  assert.equal(b.world.bricks.at(-1).owner, 7);
});

test('sim: a sword knocks a bot off the arena and credits the knockout', () => {
  const { room, me, run, of } = solo('arena', { random: () => 0.5 });
  const bot = room.ents.get(-1); bot.wander = false;
  run(60);
  Object.assign(me.body, { x: 0, y: 2, z: 17, face: 0 }); Object.assign(bot.body, { x: 0, y: 2, z: 19 });
  room.action(me.id, { t: 'swing' }); room.action(me.id, { t: 'swing' });
  assert.equal(of('swing').length, 1, 'swings have a cooldown');
  run(240);
  assert.deepEqual([me.kos, bot.outs], [1, 1]);
  assert.ok(of('score').length >= 1);
});

/* ---------- over the network ---------- */
let server: Server, db: DB, game: ReturnType<typeof createGame>, port = 0;
const cookies: Record<string, string> = {};

before(async () => {
  db = await openDb(); await migrate(db);
  game = createGame(db);
  const app = createApp({ db, secureCookies: false, rateLimit: false, places: game.counts });
  await new Promise<void>(done => { server = serve({ fetch: app.fetch, port: 0 }, info => { port = info.port; done(); }) as Server; });
  game.attach(server);
  for (const name of ['ana', 'ben']) {
    await createUser(db, { username: name, email: `${name}@example.com`, password: 'correct horse' });
    const res = await fetch(`http://localhost:${port}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-kubox': '1' }, body: JSON.stringify({ login: name, password: 'correct horse' }) });
    cookies[name] = res.headers.get('set-cookie')!.split(';')[0];
  }
});
after(async () => { await game.close(); server.close(); await db.close(); });

function connect(place: string, headers: Record<string, string>) {
  const ws = new WebSocket(`ws://localhost:${port}/ws?place=${place}`, { headers });
  const got: any[] = []; ws.on('message', d => got.push(JSON.parse(String(d))));
  const opened = new Promise<number>(res => { ws.on('open', () => res(101)); ws.on('unexpected-response', (_q, r) => res(r.statusCode!)); ws.on('error', () => {}); });
  const until = async (pred: (m: any) => boolean) => { for (let i = 0; i < 100; i++) { const m = got.find(pred); if (m) return m; await sleep(20); } throw new Error('timed out waiting for a message'); };
  return { ws, got, opened, until };
}

test('net: guests, foreign origins and unknown places are refused', async () => {
  assert.equal(await connect('sandbox', {}).opened, 401);
  assert.equal(await connect('sandbox', { cookie: cookies.ana, origin: 'https://evil.example' }).opened, 403);
  assert.equal(await connect('nowhere', { cookie: cookies.ana }).opened, 404);
});

test('net: two players share a room, see each other move, build and chat', async () => {
  const a = connect('sandbox', { cookie: cookies.ana, origin: `http://localhost:${port}` }), b = connect('sandbox', { cookie: cookies.ben });
  assert.deepEqual([await a.opened, await b.opened], [101, 101]);
  const wa = await a.until(m => m.t === 'welcome'), wb = await b.until(m => m.t === 'welcome');
  assert.ok(wb.ents.some((e: any) => e.name === 'ana'), 'ben is told ana is already here');
  await a.until(m => m.t === 'join' && m.e.name === 'ben');
  assert.deepEqual((await (await fetch(`http://localhost:${port}/api/places`)).json()).playing, { sandbox: 2, training: 0, arena: 0 });

  // ana walks for a third of a second; ben sees her position change in his snapshots
  const inputs = []; for (let i = 1; i <= 20; i++) inputs.push([i, 1, 0, false]);
  a.ws.send(JSON.stringify({ t: 'in', i: inputs.slice(0, 10) })); a.ws.send(JSON.stringify({ t: 'in', i: inputs.slice(10) }));
  const acked = await a.until(m => m.t === 's' && m.a === 20);
  assert.ok(acked.me[0] > wa.me[0] + 4, 'the server moved ana and acknowledged her last input');
  const seen = await b.until(m => m.t === 's' && m.e.some((e: any) => e[0] === wa.you && e[1] > wa.me[0] + 4));
  assert.ok(seen);

  a.ws.send(JSON.stringify({ t: 'place', x: 40, y: 0, z: 40, w: 1, h: 1, d: 1, color: Sim.COLORS[3] }));
  const placed = await b.until(m => m.t === 'b+');
  b.ws.send(JSON.stringify({ t: 'del', id: placed.b[0] }));
  assert.match((await b.until(m => m.t === 'note')).text, /only remove bricks you placed/);
  b.ws.send(JSON.stringify({ t: 'chat', text: '  hello   <b>there</b> ' }));
  assert.equal((await a.until(m => m.t === 'chat')).text, 'hello <b>there</b>');
  a.ws.send('not json'); a.ws.send(JSON.stringify({ t: 'in', i: 'garbage' })); a.ws.send(JSON.stringify({ t: 'place', x: null }));

  // a second tab for the same account takes over the first
  const a2 = connect('sandbox', { cookie: cookies.ana });
  await a2.until(m => m.t === 'welcome');
  await b.until(m => m.t === 'leave' && m.id === wa.you);
  a2.ws.close(); b.ws.close(); await sleep(150);

  // the build was saved when the room emptied, and comes back for the next visitor
  const saved = await db.query(`select bricks from place_state where place = 'sandbox'`);
  assert.ok(JSON.parse(saved.rows[0].bricks).some((r: any[]) => r[0] === 40 && r[2] === 40));
  const c = connect('sandbox', { cookie: cookies.ben });
  assert.ok((await c.until(m => m.t === 'welcome')).bricks.some((r: any[]) => r[1] === 40 && r[3] === 40));
  c.ws.close();
});
