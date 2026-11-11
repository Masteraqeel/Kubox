// Game server: one authoritative Room per place, reached over WebSocket at /ws?place=<id>.
// The Room logic itself lives in ../../js/sim.js, the same file the browser uses for prediction.
import type { IncomingMessage, Server } from 'node:http';
import { createRequire } from 'node:module';
import type { Duplex } from 'node:stream';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import type { DB } from './db.ts';
import { sha } from './util.ts';

const Sim = createRequire(import.meta.url)('../../js/sim.js');
const STEP_MS = 1000 / 60, MAX_PLAYERS = 40, SAVE_EVERY_MS = 20_000;

type Live = { room: any; conns: Map<number, WebSocket>; users: Map<number, number>; savedAt: number };

export function createGame(db: DB) {
  const rooms = new Map<string, Live>();
  const opening = new Map<string, Promise<Live>>();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });

  async function open(place: string): Promise<Live> {
    const have = rooms.get(place); if (have) return have;
    let p = opening.get(place);
    if (!p) {
      p = (async () => {
        let bricks: unknown;
        if (place === 'sandbox') {
          const r = await db.query('select bricks from place_state where place = $1', [place]);
          if (r.rows[0]) { try { bricks = JSON.parse(r.rows[0].bricks); } catch { bricks = undefined; } }
        }
        const live: Live = { room: null, conns: new Map(), users: new Map(), savedAt: Date.now() };
        live.room = new Sim.Room(place, {
          bricks,
          emit: (target: number | null, msg: unknown) => {
            const data = JSON.stringify(msg);
            if (target === null) live.conns.forEach(ws => { if (ws.readyState === 1) ws.send(data); });
            else { const ws = live.conns.get(target); if (ws && ws.readyState === 1) ws.send(data); }
          }
        });
        rooms.set(place, live); opening.delete(place);
        return live;
      })();
      opening.set(place, p);
    }
    return p;
  }

  async function save(place: string, live: Live) {
    if (place !== 'sandbox' || !live.room.dirty) return;
    live.room.dirty = false; live.savedAt = Date.now();
    await db.query(`insert into place_state (place, bricks, updated_at) values ($1, $2, now())
      on conflict (place) do update set bricks = excluded.bricks, updated_at = now()`, [place, JSON.stringify(live.room.save())]);
  }

  // One clock drives every room that has players. It catches up after a stall, to a limit.
  let last = performance.now(), acc = 0;
  const timer = setInterval(() => {
    const now = performance.now(); acc = Math.min(acc + now - last, STEP_MS * 6); last = now;
    while (acc >= STEP_MS) { acc -= STEP_MS; rooms.forEach(l => { if (l.conns.size) l.room.step(); }); }
    rooms.forEach((l, place) => { if (Date.now() - l.savedAt > SAVE_EVERY_MS) save(place, l).catch(e => console.error('save failed', e)); });
  }, STEP_MS);
  timer.unref();

  async function userFromCookie(req: IncomingMessage) {
    const m = /(?:^|;\s*)kbx=([^;]+)/.exec(req.headers.cookie || '');
    if (!m) return null;
    const r = await db.query(`select u.id, u.username, u.colors, u.role, u.banned from sessions s join users u on u.id = s.user_id where s.token_hash = $1 and s.expires_at > now()`, [sha(decodeURIComponent(m[1]))]);
    return r.rows[0] && !r.rows[0].banned ? r.rows[0] : null;
  }

  function refuse(socket: Duplex, code: number, text: string) {
    socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); socket.destroy();
  }

  function attach(server: Server) {
    server.on('upgrade', async (req, socket, head) => {
      try {
        const url = new URL(req.url || '/', 'http://x');
        if (url.pathname !== '/ws') return refuse(socket, 404, 'Not Found');
        // Browsers always send Origin. It must match the host, or another site could play as a logged-in visitor.
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host) return refuse(socket, 403, 'Forbidden');
        const place = url.searchParams.get('place') || '';
        if (!Sim.PLACES.includes(place)) return refuse(socket, 404, 'Not Found');
        const user = await userFromCookie(req);
        if (!user) return refuse(socket, 401, 'Unauthorized');
        const live = await open(place);
        if (live.conns.size >= MAX_PLAYERS && !live.users.has(user.id)) return refuse(socket, 503, 'Full');
        wss.handleUpgrade(req, socket, head, ws => connect(ws, place, live, user));
      } catch (e) { console.error(e); socket.destroy(); }
    });
  }

  function connect(ws: WebSocket, place: string, live: Live, user: { id: number; username: string; colors: string; role: string }) {
    // One body per account per place: a second tab takes over from the first.
    const old = live.users.get(user.id);
    if (old !== undefined) { const prev = live.conns.get(old); live.conns.delete(old); live.room.leave(old); prev?.close(4001, 'Joined from another tab'); }
    if (rooms.get(place) !== live) rooms.set(place, live); // the room may have been retired while this player was connecting
    // The id must be registered before join() runs, because join() sends the welcome message.
    const id: number = live.room.nextId;
    live.conns.set(id, ws); live.users.set(user.id, id);
    live.room.join({ name: user.username, colors: user.colors.split(','), role: user.role, userId: user.id });

    function drop(which: number) {
      if (!live.conns.delete(which)) return;
      if (live.users.get(user.id) === which) live.users.delete(user.id);
      live.room.leave(which);
      if (live.conns.size === 0) {
        save(place, live).catch(e => console.error('save failed', e));
        if (place !== 'sandbox') rooms.delete(place); // training and arena reset when they empty
      }
    }
    let count = 0, windowStart = Date.now();
    ws.on('message', raw => {
      const now = Date.now(); if (now - windowStart > 1000) { windowStart = now; count = 0; }
      if (++count > 150) return ws.close(4008, 'Too many messages');
      let m: any; try { m = JSON.parse(String(raw)); } catch { return; }
      if (!m || typeof m !== 'object') return;
      if (m.t === 'in') live.room.input(id, m.i); else live.room.action(id, m);
    });
    ws.on('close', () => drop(id));
    ws.on('error', () => drop(id));
  }

  const counts = () => Object.fromEntries(Sim.PLACES.map((p: string) => [p, rooms.get(p)?.conns.size ?? 0]));
  async function close() { clearInterval(timer); for (const [place, l] of rooms) { await save(place, l); l.conns.forEach(ws => ws.close(1001)); } wss.close(); }
  return { attach, counts, close };
}
