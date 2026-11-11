/* Kubox shared simulation. The same file runs in the browser (window.KBSim) and on the game server (require).
   It holds the physics, the three places, and Room: the authoritative world that decides what really happened.
   1 unit = 1 stud. Bricks sit on an integer grid. The simulation advances in fixed steps of 1/60 second. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KBSim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const COLORS = ['#d9342b', '#f5b800', '#2fa84f', '#2b6fd9', '#f2f2ee', '#3a3f4b', '#e07b1a', '#8a4fd1'];
  const SIZES = [[1, 1, 1], [2, 1, 2], [4, 1, 2], [1, 4, 1], [4, 4, 1]];
  const R = 0.7, H = 3.5, SPEED = 16, JUMP = 24, GRAV = 70, DT = 1 / 60, VOID = -45;
  const BOTS = ['Bot Alpha', 'Bot Bravo', 'Bot Charlie', 'Bot Delta', 'Bot Echo', 'Bot Foxtrot']; // usernames cannot contain spaces, so these never clash with a player
  const BOT_COLORS = [['#f2f2ee', '#d9342b', '#3a3f4b'], ['#3a3f4b', '#111522', '#d9342b'], ['#9aa3ad', '#e07b1a', '#3a3f4b'], ['#f5d76e', '#2fa84f', '#1c6b33'], ['#c9a27a', '#3a5f3a', '#22301f'], ['#7fe3ff', '#f2f2ee', '#2b6fd9']];
  const MAX_BRICKS = 4000, MAX_HEIGHT = 120;
  // Wearable hats and their colours. FREE_HATS need no ownership; the rest are catalog items.
  const HATS = { cap: '#2b6fd9', cone: '#e07b1a', shades: '#3a3f4b', tophat: '#f5b800', crown: '#e07b1a', visor: '#7fe3ff', horns: '#d9342b' };
  const FREE_HATS = ['cap', 'cone', 'shades'];

  /* ---------- physics ---------- */
  function hits(w, x, y, z) {
    const bs = w.bricks;
    for (let i = 0; i < bs.length; i++) { const k = bs[i]; if (x + R > k.x && x - R < k.x + k.w && y + H > k.y && y < k.y + k.h && z + R > k.z && z - R < k.z + k.d) return k; }
    return null;
  }
  function newBody(x, y, z) { return { x, y, z, vx: 0, vy: 0, vz: 0, grounded: false, blocked: false, kx: 0, kz: 0, stun: 0, face: Math.PI, sx: x, sy: y, sz: z }; }
  function stepBody(w, b, dt) {
    let x = b.x, y = b.y, z = b.z; b.blocked = false;
    for (let a = 0; a < 2; a++) {
      const nx = a === 0 ? x + b.vx * dt : x, nz = a === 1 ? z + b.vz * dt : z, k = hits(w, nx, y, nz);
      if (!k) { x = nx; z = nz; }
      else { const top = k.y + k.h; if (top - y <= 1.01 && !hits(w, nx, top, nz)) { x = nx; z = nz; y = top; } else b.blocked = true; }
    }
    b.vy = Math.max(b.vy - GRAV * dt, -80);
    let ny = y + b.vy * dt; b.grounded = false;
    const k = hits(w, x, ny, z);
    if (k) { if (b.vy <= 0) { ny = k.y + k.h; b.grounded = true; } else ny = k.y - H; b.vy = 0; }
    if (w.plate && ny <= 0 && y >= 0 && Math.abs(x) <= w.half && Math.abs(z) <= w.half) { ny = 0; b.vy = 0; b.grounded = true; }
    b.x = x; b.y = ny; b.z = z;
  }
  /* One fixed step for one body. Client prediction and the server run exactly this, which is why they agree.
     Returns true when the body fell into the void and was put back at its spawn. */
  function applyInput(w, b, inp) {
    if (b.stun > 0) { b.stun -= DT; b.vx = b.kx; b.vz = b.kz; b.kx *= 0.96; b.kz *= 0.96; }
    else {
      b.vx = inp.mx * SPEED; b.vz = inp.mz * SPEED;
      if (inp.mx || inp.mz) b.face = Math.atan2(inp.mx, inp.mz);
      if (inp.jump && b.grounded) b.vy = JUMP;
    }
    stepBody(w, b, DT);
    if (b.y < VOID) { b.x = b.sx; b.y = b.sy + 4; b.z = b.sz; b.vx = b.vy = b.vz = 0; b.kx = b.kz = 0; b.stun = 0; return true; }
    return false;
  }
  const overlap = (a, k) => a.x < k.x + k.w && a.x + a.w > k.x && a.y < k.y + k.h && a.y + a.h > k.y && a.z < k.z + k.d && a.z + a.d > k.z;
  const touchesBody = (g, b) => b.x + R > g.x && b.x - R < g.x + g.w && b.y + H > g.y && b.y < g.y + g.h && b.z + R > g.z && b.z - R < g.z + g.d;
  /* Is a brick allowed here? `bodies` are the players and bots it must not be placed inside. */
  function canPlace(w, g, bodies) {
    const lim = w.plate ? w.half : 40;
    if (g.y < 0 || g.y + g.h > MAX_HEIGHT || g.x < -lim || g.z < -lim || g.x + g.w > lim || g.z + g.d > lim || w.bricks.length >= MAX_BRICKS) return false;
    for (let i = 0; i < w.bricks.length; i++) if (overlap(g, w.bricks[i])) return false;
    for (let i = 0; i < bodies.length; i++) if (touchesBody(g, bodies[i])) return false;
    return true;
  }
  const validSize = (w, h, d) => SIZES.some(s => s[1] === h && ((s[0] === w && s[2] === d) || (s[0] === d && s[2] === w)));

  /* ---------- places ---------- */
  function preset(id) {
    const bricks = [], bots = [], B = (x, y, z, w, h, d, color, locked) => bricks.push([x, y, z, w, h, d, color, locked ? 1 : 0]);
    const p = { plate: id !== 'arena', half: id !== 'arena' ? 64 : 0, bound: 0, spawn: [0, 3, 6], bricks, bots };
    if (id === 'training') {
      B(-6, 0, -26, 12, 2, 5, '#3a3f4b'); B(-2, 2, -25, 4, 1, 3, '#f5b800'); B(-8, 0, -24, 2, 1, 2, '#3a3f4b');
      B(-10, 0, -27, 1, 4, 1, '#f2f2ee'); B(-10, 4, -27, 1, 4, 1, '#f2f2ee'); B(-9, 6, -27, 3, 2, 1, '#3a5f3a');
      for (let i = 0; i < 6; i++) { B(-11 + i * 4, 0, -12, 2, 1, 2, '#f5b800'); bots.push({ name: BOTS[i], colors: BOT_COLORS[i], x: -10 + i * 4, y: 1, z: -11, wander: false }); }
      for (let i = 0; i < 6; i++) B(20, 0, -16 + i * 3, 6, i + 1, 3, i % 2 ? '#2b6fd9' : '#f2f2ee');
      [[20, 5], [20, 12], [14, 18], [6, 18]].forEach((q, i) => B(q[0], 5, q[1], 4, 1, 4, i % 2 ? '#e07b1a' : '#d9342b'));
      B(-2, 0, 16, 6, 6, 6, '#2fa84f'); B(-1, 6, 17, 4, 1, 4, '#f5b800');
      for (let i = 0; i < 5; i++) B(-20, 0, 2 + i * 5, 8, 2 + (i % 2) * 2, 1, '#3a3f4b');
      p.spawn = [0, 1, 0];
    } else if (id === 'arena') {
      B(-20, 0, -20, 40, 2, 40, '#3a3f4b', true);
      [[-20, -20, '#d9342b'], [16, -20, '#2b6fd9'], [-20, 16, '#2b6fd9'], [16, 16, '#d9342b']].forEach(q => B(q[0], 2, q[1], 4, 5, 4, q[2], true));
      B(-2, 2, -2, 4, 1, 4, '#f5b800', true); B(-1, 3, -1, 2, 3, 2, '#f5b800', true);
      B(-12, 2, -1, 6, 2, 2, '#f2f2ee', true); B(6, 2, -1, 6, 2, 2, '#f2f2ee', true); B(-1, 2, -12, 2, 2, 6, '#f2f2ee', true); B(-1, 2, 6, 2, 2, 6, '#f2f2ee', true);
      for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.6; bots.push({ name: BOTS[i], colors: BOT_COLORS[i], x: Math.cos(a) * 13.5, y: 2, z: Math.sin(a) * 13.5, wander: true }); }
      p.spawn = [0, 4, 14]; p.bound = 18;
    } else {
      B(-2, 0, 4, 4, 1, 4, '#f5b800');
      for (let i = 0; i < 6; i++) for (let j = 0; j < 3 - (i % 2); j++) B(-12 + i * 4 + (j % 2) * 2, j, -8, 4, 1, 2, COLORS[(i + j) % 4]);
      for (let i = 0; i < 4; i++) B(14, 0, -6 + i * 2, 4, i + 1, 2, COLORS[4 + (i % 2)]);
      B(-16, 0, 2, 1, 4, 1, '#f2f2ee'); B(-11, 0, 2, 1, 4, 1, '#f2f2ee'); B(-16, 4, 2, 6, 1, 1, '#d9342b');
    }
    return p;
  }

  /* ---------- Room: the authoritative world ----------
     emit(target, message) delivers a message to one player id, or to everyone when target is null.
     The server wires emit to WebSockets. Offline play wires it straight back into the client. */
  class Room {
    constructor(place, opts) {
      opts = opts || {};
      this.place = place; this.emit = opts.emit || function () {}; this.random = opts.random || Math.random;
      this.world = { bricks: [], plate: false, half: 0 }; this.ents = new Map(); this.nextBrick = 1; this.nextId = 1; this.tick = 0; this.dirty = false; this.scoreDirty = false;
      const p = preset(place); this.world.plate = p.plate; this.world.half = p.half; this.spawn = p.spawn; this.bound = p.bound;
      // A saved sandbox replaces the starter build. Saved rows are [x,y,z,w,h,d,color,owner].
      if (place === 'sandbox' && Array.isArray(opts.bricks)) opts.bricks.forEach(b => { if (this._sane(b)) this._add(b[0], b[1], b[2], b[3], b[4], b[5], b[6], +b[7] || 0, false); });
      else p.bricks.forEach(b => this._add(b[0], b[1], b[2], b[3], b[4], b[5], b[6], 0, !!b[7]));
      p.bots.forEach((b, i) => { const e = this._ent(-(i + 1), b.name, b.colors, b.x, b.y, b.z); e.bot = true; e.wander = b.wander; e.heading = this.random() * 6.28; e.think = 0; });
    }
    _sane(b) { return Array.isArray(b) && b.length >= 7 && [0, 1, 2].every(i => Number.isInteger(b[i]) && Math.abs(b[i]) <= 200) && [3, 4, 5].every(i => Number.isInteger(b[i]) && b[i] >= 1 && b[i] <= 64) && /^#[0-9a-f]{6}$/i.test(b[6]) && this.world.bricks.length < MAX_BRICKS; }
    _add(x, y, z, w, h, d, color, owner, locked) { const b = { id: this.nextBrick++, x, y, z, w, h, d, color, owner, locked }; this.world.bricks.push(b); return b; }
    _ent(id, name, colors, x, y, z) {
      const e = { id, name, colors, hat: '', bot: false, role: 'member', userId: 0, body: newBody(x, y, z), queue: [], last: { mx: 0, mz: 0, jump: false }, ack: 0, idle: 0, kos: 0, outs: 0, hitBy: 0, swingCd: 0, moving: false, placeTokens: 8, chatTokens: 5 };
      this.ents.set(id, e); return e;
    }
    get players() { let n = 0; this.ents.forEach(e => { if (!e.bot) n++; }); return n; }
    static wire(b) { return [b.id, b.x, b.y, b.z, b.w, b.h, b.d, b.color, b.owner, b.locked ? 1 : 0]; }
    _info(e) { return { id: e.id, name: e.name, colors: e.colors, hat: e.hat, bot: e.bot }; }
    _scores() { const rows = []; this.ents.forEach(e => rows.push([e.id, e.kos, e.outs])); return rows; }

    join(info) {
      const id = this.nextId++, s = this.spawn, e = this._ent(id, info.name, info.colors, s[0] + ((id * 3) % 7) - 3, s[1], s[2] + ((id * 5) % 5) - 2);
      e.role = info.role || 'member'; e.userId = info.userId || 0; e.hat = HATS[info.hat] ? info.hat : '';
      const b = e.body;
      this.emit(null, { t: 'join', e: this._info(e) });
      const ents = []; this.ents.forEach(o => ents.push(this._info(o)));
      this.emit(id, { t: 'welcome', you: id, place: this.place, plate: this.world.plate, half: this.world.half, me: [b.x, b.y, b.z], bricks: this.world.bricks.map(Room.wire), ents, scores: this._scores() });
      return e;
    }
    leave(id) { if (this.ents.delete(id)) { this.emit(null, { t: 'leave', id }); this.scoreDirty = true; } }

    /* Queue movement inputs: [[seq, mx, mz, jump], ...]. One is consumed per step, so sending them faster gains nothing. */
    input(id, list) {
      const e = this.ents.get(id); if (!e || e.bot || !Array.isArray(list)) return;
      for (let i = 0; i < list.length && i < 12; i++) {
        const r = list[i]; if (!Array.isArray(r)) continue;
        let seq = r[0], mx = +r[1], mz = +r[2];
        if (!Number.isInteger(seq) || !isFinite(mx) || !isFinite(mz) || seq <= (e.queue.length ? e.queue[e.queue.length - 1].seq : e.ack)) continue;
        const len = Math.hypot(mx, mz); if (len > 1.0001) { mx /= len; mz /= len; }
        e.queue.push({ seq, mx, mz, jump: !!r[3] });
      }
      if (e.queue.length > 20) e.queue.splice(0, e.queue.length - 20);
    }

    action(id, m) {
      const e = this.ents.get(id); if (!e || e.bot || !m) return;
      if (m.t === 'place') {
        const g = { x: m.x, y: m.y, z: m.z, w: m.w, h: m.h, d: m.d };
        if (![g.x, g.y, g.z].every(Number.isInteger) || !validSize(g.w, g.h, g.d) || !COLORS.includes(m.color) || e.placeTokens < 1) return;
        const b = e.body; if (Math.hypot(g.x + g.w / 2 - b.x, g.z + g.d / 2 - b.z) > 90) return;
        const bodies = []; this.ents.forEach(o => bodies.push(o.body));
        if (!canPlace(this.world, g, bodies)) return;
        e.placeTokens -= 1; this.dirty = true;
        this.emit(null, { t: 'b+', b: Room.wire(this._add(g.x, g.y, g.z, g.w, g.h, g.d, m.color, e.userId, false)) });
      } else if (m.t === 'del') {
        const i = this.world.bricks.findIndex(b => b.id === m.id); if (i < 0) return;
        const b = this.world.bricks[i], staff = e.role === 'mod' || e.role === 'admin';
        if (b.locked) return this.emit(id, { t: 'note', text: 'That brick is part of the map.' });
        if (b.owner !== e.userId && !staff) return this.emit(id, { t: 'note', text: 'You can only remove bricks you placed.' });
        this.world.bricks.splice(i, 1); this.dirty = true; this.emit(null, { t: 'b-', id: b.id });
      } else if (m.t === 'swing') {
        if (e.swingCd > 0) return; e.swingCd = 0.4;
        this.emit(null, { t: 'swing', id });
        const a = e.body, fx = Math.sin(a.face), fz = Math.cos(a.face);
        this.ents.forEach(o => {
          if (o === e || (!o.bot && this.place !== 'arena')) return; // players can only be knocked back in the arena
          const dx = o.body.x - a.x, dz = o.body.z - a.z, dist = Math.hypot(dx, dz);
          if (dist < 6 && Math.abs(o.body.y - a.y) < 4 && (dx * fx + dz * fz) / (dist || 1) > 0.2) { o.body.kx = fx * 34; o.body.kz = fz * 34; o.body.vy = 20; o.body.stun = 0.7; o.hitBy = id; }
        });
      } else if (m.t === 'chat') {
        const text = String(m.text || '').replace(/\s+/g, ' ').trim().slice(0, 120);
        if (!text) return;
        if (e.chatTokens < 1) return this.emit(id, { t: 'note', text: 'You are sending messages too fast.' });
        e.chatTokens -= 1; this.emit(null, { t: 'chat', id, name: e.name, text });
      }
    }

    step() {
      const w = this.world;
      this.ents.forEach(e => {
        const b = e.body; let inp;
        if (e.bot) {
          inp = { mx: 0, mz: 0, jump: false };
          if (e.wander && b.grounded && b.stun <= 0) {
            e.think -= DT;
            if (e.think <= 0 || b.blocked) { e.heading = this.random() * 6.28; e.think = 1 + this.random() * 3; }
            const nx = b.x + Math.sin(e.heading) * 2.5, nz = b.z + Math.cos(e.heading) * 2.5;
            if (this.bound && (Math.abs(nx) > this.bound || Math.abs(nz) > this.bound) && this.random() > 0.004) e.heading = Math.atan2(-b.x, -b.z) + (this.random() - 0.5);
            inp.mx = Math.sin(e.heading) * 0.375; inp.mz = Math.cos(e.heading) * 0.375;
          }
        } else if (e.queue.length) { inp = e.queue.shift(); e.ack = inp.seq; e.last = inp; e.idle = 0; }
        // No input this step: repeat the last one briefly to ride out network jitter, then stand still (a hidden tab sends nothing).
        else inp = ++e.idle > 30 ? { mx: 0, mz: 0, jump: false } : { mx: e.last.mx, mz: e.last.mz, jump: false };
        e.moving = !!(inp.mx || inp.mz) && b.stun <= 0;
        if (applyInput(w, b, inp)) {
          e.outs++; this.scoreDirty = true;
          const by = e.hitBy && this.ents.get(e.hitBy); if (by) by.kos++;
          e.hitBy = 0;
        } else if (b.grounded && b.stun <= 0) e.hitBy = 0;
        if (e.swingCd > 0) e.swingCd -= DT;
        if (e.placeTokens < 8) e.placeTokens += DT * 8;
        if (e.chatTokens < 5) e.chatTokens += DT * 0.5;
      });
      this.tick++;
      if (this.tick % 3 === 0) {
        const r = n => Math.round(n * 100) / 100, all = [];
        this.ents.forEach(e => all.push([e.id, r(e.body.x), r(e.body.y), r(e.body.z), r(e.body.face), e.moving ? 1 : 0]));
        this.ents.forEach(e => { if (!e.bot) { const b = e.body; this.emit(e.id, { t: 's', a: e.ack, me: [b.x, b.y, b.z, b.vy, b.grounded ? 1 : 0, b.kx, b.kz, b.stun, b.face], e: all }); } });
      }
      if (this.scoreDirty) { this.scoreDirty = false; this.emit(null, { t: 'score', rows: this._scores() }); }
    }
    /* Player-built bricks, in the form the constructor accepts back. */
    save() { return this.world.bricks.filter(b => !b.locked).map(b => [b.x, b.y, b.z, b.w, b.h, b.d, b.color, b.owner]); }
  }

  return { HATS, FREE_HATS, COLORS, SIZES, R, H, SPEED, JUMP, DT, PLACES: ['sandbox', 'training', 'arena'], hits, newBody, stepBody, applyInput, canPlace, preset, Room };
});
