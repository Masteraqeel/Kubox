/* Kubox game client. It draws the world with three.js and talks to a Room (see js/sim.js).
   Online, the Room runs on the server and messages travel over a WebSocket.
   Offline, the Room runs in this page and messages are passed straight across. The client code is the same either way:
   it predicts its own movement with the shared step function, then corrects itself from the Room's snapshots. */
window.KBGame = (function () {
  const Sim = window.KBSim;
  let S = null;
  const DELAY = 100; // other players are drawn this many milliseconds in the past, between two snapshots

  /* ---------- drawing helpers ---------- */
  function studTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(0,0,0,.16)'; g.beginPath(); g.arc(34, 35, 19, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 18, 0, 7); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = 2; g.stroke();
    g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 1; g.strokeRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }
  function mats(color, w, d) {
    const k = color + w + 'x' + d;
    if (!S.mat[k]) {
      const map = S.stud.clone(); map.needsUpdate = true; map.repeat.set(w, d);
      const side = S.mat[color] || (S.mat[color] = new THREE.MeshLambertMaterial({ color }));
      S.mat[k] = [side, side, new THREE.MeshLambertMaterial({ color, map }), side, side, side];
    }
    return S.mat[k];
  }
  function makeAvatar(c, hat) {
    const g = new THREE.Group(), m = col => new THREE.MeshLambertMaterial({ color: col });
    const box = (w, h, d, x, y, z, mat, par) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); o.position.set(x, y, z); (par || g).add(o); return o; };
    const fl = box(.6, .7, .9, -.4, .35, 0, m(c[2])), fr = box(.6, .7, .9, .4, .35, 0, m(c[2]));
    box(1.5, 1.4, .9, 0, 1.4, 0, m(c[1])); box(.4, 1.2, .5, -.97, 1.45, 0, m(c[1]));
    const arm = new THREE.Group(); arm.position.set(.97, 2.0, 0); g.add(arm); box(.4, 1.2, .5, 0, -.55, 0, m(c[1]), arm);
    const sword = box(.18, .3, 2.8, 0, -1.1, 1.3, m('#cfd6e0'), arm); sword.visible = false;
    box(1.5, 1.4, 1.5, 0, 2.8, 0, m(c[0])); box(1.2, .4, .1, 0, 2.85, .76, m('#1b2233'));
    const hc = Sim.HATS[hat];
    if (hc) {
      const hm = m(hc), dark = m('#1b2233');
      if (hat === 'tophat') { box(2, .15, 2, 0, 3.6, 0, hm); box(1.25, 1, 1.25, 0, 4.15, 0, hm); box(1.3, .2, 1.3, 0, 3.8, 0, dark); }
      else if (hat === 'crown') { box(1.55, .45, 1.55, 0, 3.75, 0, hm); [[-.6, -.6], [.6, -.6], [-.6, .6], [.6, .6]].forEach(q => box(.32, .4, .32, q[0], 4.15, q[1], hm)); }
      else if (hat === 'visor') { box(1.62, .55, .2, 0, 2.85, .8, hm); box(1.3, .25, .06, 0, 2.85, .92, dark); }
      else if (hat === 'horns') { box(.28, .95, .28, -.55, 3.95, 0, hm).rotation.z = .35; box(.28, .95, .28, .55, 3.95, 0, hm).rotation.z = -.35; }
      else if (hat === 'cap') { box(1.56, .4, 1.56, 0, 3.72, 0, hm); box(1.3, .1, .7, 0, 3.58, 1.05, hm); }
      else if (hat === 'cone') { box(1.4, .12, 1.4, 0, 3.58, 0, hm); const cone = new THREE.Mesh(new THREE.ConeGeometry(.6, 1.5, 14), hm); cone.position.set(0, 4.38, 0); g.add(cone); }
      else if (hat === 'shades') { box(1.4, .36, .12, 0, 2.9, .82, hm); }
    }
    S.scene.add(g);
    return { g, fl, fr, arm, sword, walk: 0, swing: 0 };
  }
  function nameTag(av, name, bot) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
    g.font = 'bold 30px Verdana, sans-serif'; const w = Math.min(248, g.measureText(name).width + 28);
    g.fillStyle = bot ? 'rgba(60,66,80,.7)' : 'rgba(20,28,50,.8)'; g.fillRect(128 - w / 2, 10, w, 44);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, 128, 33, 240);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    s.scale.set(5, 1.25, 1); s.position.y = 5.5; av.g.add(s);
  }
  const colours = c => (Array.isArray(c) && c.length === 3 && c.every(x => /^#[0-9a-f]{6}$/i.test(x)) ? c : ['#f5b800', '#2b6fd9', '#1d2b4f']);
  function pose(av, x, y, z, face, moving, dt, armed) {
    av.g.position.set(x, y, z); av.g.rotation.y = face;
    av.walk += moving ? dt * 12 : 0; const s = moving ? Math.sin(av.walk) * .35 : 0;
    av.fl.position.z = s; av.fr.position.z = -s;
    if (av.swing > 0) { av.swing -= dt; av.sword.visible = true; av.arm.rotation.x = -Math.sin(Math.max(0, 1 - av.swing / .3) * Math.PI) * 1.9; }
    else { av.sword.visible = !!armed; av.arm.rotation.x = armed ? -.5 : 0; }
  }

  /* ---------- world ---------- */
  function addBrick(r) {
    const b = { id: r[0], x: r[1], y: r[2], z: r[3], w: r[4], h: r[5], d: r[6], color: r[7], owner: r[8], locked: !!r[9] };
    b.mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mats(b.color, b.w, b.d));
    b.mesh.position.set(b.x + b.w / 2, b.y + b.h / 2, b.z + b.d / 2); b.mesh.userData.brick = b;
    S.scene.add(b.mesh); S.world.bricks.push(b); S.pick.push(b.mesh);
  }
  function removeBrick(id) {
    const i = S.world.bricks.findIndex(b => b.id === id); if (i < 0) return;
    const b = S.world.bricks[i]; S.scene.remove(b.mesh); b.mesh.geometry.dispose();
    S.world.bricks.splice(i, 1); S.pick.splice(S.pick.indexOf(b.mesh), 1);
  }
  function addEnt(e) {
    if (S.ents.has(e.id)) return;
    const av = makeAvatar(colours(e.colors), e.hat); nameTag(av, e.name, e.bot); av.g.visible = false;
    S.ents.set(e.id, { id: e.id, name: e.name, bot: e.bot, av, buf: [] });
  }
  function removeEnt(id) { const e = S.ents.get(id); if (!e) return; S.scene.remove(e.av.g); S.ents.delete(id); }

  /* ---------- messages from the Room ---------- */
  function onMsg(m) {
    if (!S) return;
    if (m.t === 'welcome') {
      S.myId = m.you; S.world.plate = m.plate; S.world.half = m.half;
      if (m.plate) {
        const map = S.stud.clone(); map.needsUpdate = true; map.repeat.set(128, 128);
        const side = new THREE.MeshLambertMaterial({ color: '#3d7f41' }), top = new THREE.MeshLambertMaterial({ color: '#4a9b4f', map });
        const plate = new THREE.Mesh(new THREE.BoxGeometry(128, 1, 128), [side, side, top, side, side, side]);
        plate.position.y = -.5; S.scene.add(plate); S.pick.push(plate);
      }
      m.bricks.forEach(addBrick);
      const mine = m.ents.find(e => e.id === m.you);
      S.names.set(m.you, mine.name);
      S.me = { id: m.you, body: Sim.newBody(m.me[0], m.me[1], m.me[2]), av: makeAvatar(colours(mine.colors), mine.hat) };
      m.ents.forEach(e => { S.names.set(e.id, e.name); if (e.id !== m.you) addEnt(e); });
      S.scores = m.scores; status(); hud(); board();
    } else if (m.t === 'join') { if (m.e.id !== S.myId && S.me) { S.names.set(m.e.id, m.e.name); addEnt(m.e); log(m.e.name + ' joined.', 1); status(); board(); } }
    else if (m.t === 'leave') { const e = S.ents.get(m.id); if (e) { log(e.name + ' left.', 1); removeEnt(m.id); status(); } }
    else if (m.t === 's') {
      if (!S.me) return;
      // Reconcile: take the Room's state as of input `a`, then replay the inputs it has not processed yet.
      const b = S.me.body, a = m.me;
      b.x = a[0]; b.y = a[1]; b.z = a[2]; b.vy = a[3]; b.grounded = !!a[4]; b.kx = a[5]; b.kz = a[6]; b.stun = a[7]; b.face = a[8];
      while (S.pending.length && S.pending[0].seq <= m.a) S.pending.shift();
      for (let i = 0; i < S.pending.length; i++) Sim.applyInput(S.world, b, S.pending[i]);
      const now = performance.now();
      for (let i = 0; i < m.e.length; i++) { const r = m.e[i], e = S.ents.get(r[0]); if (e) { e.buf.push({ t: now, x: r[1], y: r[2], z: r[3], f: r[4], mv: r[5] }); if (e.buf.length > 10) e.buf.shift(); } }
    } else if (m.t === 'b+') { addBrick(m.b); saveLocal(); }
    else if (m.t === 'b-') { removeBrick(m.id); saveLocal(); }
    else if (m.t === 'swing') { const av = m.id === S.myId ? S.me && S.me.av : (S.ents.get(m.id) || {}).av; if (av) av.swing = .3; }
    else if (m.t === 'chat') log(m.name + ': ' + m.text);
    else if (m.t === 'note') log(m.text, 1);
    else if (m.t === 'score') { S.scores = m.rows; board(); }
  }
  function send(m) {
    if (S.room) S.room.action(S.myId, m);
    else if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(m));
  }
  function saveLocal() {
    if (!S.room || S.place.id !== 'sandbox') return;
    try { localStorage.setItem('kubox-sandbox', JSON.stringify(S.room.save())); } catch (e) { /* storage unavailable */ }
  }

  /* ---------- tools ---------- */
  function ray(e) {
    const r = S.canvas.getBoundingClientRect();
    S.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    S.caster.setFromCamera(S.mouse, S.cam);
    return S.caster.intersectObjects(S.pick, false)[0] || null;
  }
  function placement(hit) {
    const n = hit.face.normal, p = hit.point, s = Sim.SIZES[S.size], w = S.rot ? s[2] : s[0], h = s[1], d = S.rot ? s[0] : s[2];
    let x = Math.floor(p.x + n.x * .5), y = Math.floor(p.y + n.y * .5), z = Math.floor(p.z + n.z * .5);
    if (n.x < -.5) x -= w - 1; if (n.y < -.5) y -= h - 1; if (n.z < -.5) z -= d - 1;
    const g = { x, y, z, w, h, d }, bodies = [S.me.body];
    S.ents.forEach(e => { const l = e.buf[e.buf.length - 1]; if (l) bodies.push(l); });
    g.ok = Sim.canPlace(S.world, g, bodies);
    return g;
  }
  function ghost(e) {
    const hit = S.tool === 0 && e && S.me ? ray(e) : null;
    if (!hit) { S.ghost.visible = false; return; }
    const g = placement(hit); S.ghost.visible = true; S.ghost.scale.set(g.w, g.h, g.d);
    S.ghost.position.set(g.x + g.w / 2, g.y + g.h / 2, g.z + g.d / 2); S.ghost.material.color.set(g.ok ? Sim.COLORS[S.color] : '#ff2222');
  }
  function act(e) {
    if (!S.me) return;
    if (S.tool === 2) return send({ t: 'swing' });
    const hit = ray(e); if (!hit) return;
    if (S.tool === 0) { const g = placement(hit); if (g.ok) send({ t: 'place', x: g.x, y: g.y, z: g.z, w: g.w, h: g.h, d: g.d, color: Sim.COLORS[S.color] }); }
    else { const b = hit.object.userData.brick; if (b) send({ t: 'del', id: b.id }); }
  }
  function setTool(i) { S.tool = i; S.ghost.visible = false; hud(); }

  /* ---------- hud ---------- */
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function hud() {
    const names = ['1 Build', '2 Delete', '3 Sword'];
    let h = `<div class="hot">${names.map((n, i) => `<button data-t="${i}" class="${S.tool === i ? 'on' : ''}">${n}</button>`).join('')}${S.room && S.place.id === 'sandbox' ? '<button data-reset="1">Reset build</button>' : ''}</div>`;
    if (S.tool === 0) h += `<div class="hot">${Sim.SIZES.map((s, i) => `<button data-s="${i}" class="${S.size === i ? 'on' : ''}">${s[0]}x${s[1]}x${s[2]}</button>`).join('')}<button data-rot="1" class="${S.rot ? 'on' : ''}">R Rotate</button></div><div class="hot">${Sim.COLORS.map((c, i) => `<button class="sw${S.color === i ? ' on' : ''}" data-c="${i}" style="background:${c}" aria-label="Colour ${i + 1}"></button>`).join('')}</div>`;
    S.hudBot.innerHTML = h;
  }
  function board() {
    const rows = (S.scores || []).filter(r => S.names.has(r[0])).sort((a, b) => b[1] - a[1] || (a[0] < 0) - (b[0] < 0)).map(r => `<tr><td>${r[0] === S.myId ? '<b>' + esc(S.names.get(r[0])) + '</b>' : esc(S.names.get(r[0]))}</td><td class="c">${r[1]}</td><td class="c">${r[2]}</td></tr>`).join('');
    S.hudTr.innerHTML = `<table><tr><th>Player</th><th class="c">KOs</th><th class="c">Falls</th></tr>${rows}</table>`;
  }
  function status() {
    let people = 1; S.ents.forEach(e => { if (!e.bot) people++; });
    const mode = S.room ? 'Offline practice.' + (S.opts.hint ? ' ' + esc(S.opts.hint) : '') : S.me ? `Online. ${people} ${people === 1 ? 'player' : 'players'} here.` : 'Connecting';
    const tip = S.place.id === 'arena' ? 'Click to swing. Knock the others off the platform.' : S.place.id === 'training' ? 'Recruits are lined up. Take the podium or run the course.' : S.room ? 'Click to place a brick. Your build saves in this browser.' : 'Click to place a brick. Everyone here builds on the same baseplate.';
    S.hudTl.innerHTML = `<b>${esc(S.place.name)}</b><br><span data-mode="${S.room ? 'offline' : 'online'}">${mode}</span><br>${tip}`;
  }
  function log(text, system) {
    const d = document.createElement('div'); d.textContent = text; if (system) d.className = 'sys';
    S.chatLog.appendChild(d); while (S.chatLog.children.length > 7) S.chatLog.removeChild(S.chatLog.firstChild);
  }
  function lost(e) {
    const was = !!S.me, text = e.code === 4001 ? 'You opened this place in another tab.' : was ? 'The connection to the game server was lost.' : 'Could not connect to the game server.';
    const el = S.el, place = S.place, opts = S.opts;
    stop();
    el.innerHTML = `<div class="hud mid"><p>${text}</p><div class="hot"><button data-go="online">Reconnect</button><button data-go="offline">Practise offline</button></div></div>`;
    el.querySelector('.hud.mid').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) start(el, place, Object.assign({}, opts, { online: b.dataset.go === 'online' })); });
  }

  /* ---------- loop ---------- */
  function frame(t) {
    if (!S) return; S.raf = requestAnimationFrame(frame);
    const dt = Math.max(0, Math.min(.1, (t - S.last) / 1000 || 0)); S.last = t;
    if (S.me) {
      const K = S.keys, b = S.me.body; let moving = false, n = 0;
      S.acc += dt;
      while (S.acc >= Sim.DT && n < 6) {
        S.acc -= Sim.DT; n++;
        const f = (K.KeyW || K.ArrowUp ? 1 : 0) - (K.KeyS || K.ArrowDown ? 1 : 0), r = (K.KeyD || K.ArrowRight ? 1 : 0) - (K.KeyA || K.ArrowLeft ? 1 : 0);
        let mx = -Math.sin(S.yaw) * f + Math.cos(S.yaw) * r, mz = -Math.cos(S.yaw) * f - Math.sin(S.yaw) * r; const len = Math.hypot(mx, mz);
        if (len > 0) { mx /= len; mz /= len; }
        const inp = { seq: ++S.seq, mx, mz, jump: !!K.Space };
        S.pending.push(inp); if (S.pending.length > 180) S.pending.shift();
        Sim.applyInput(S.world, b, inp);
        if (S.room) { S.room.input(S.myId, [[inp.seq, mx, mz, inp.jump]]); S.room.step(); if (!S) return; }
        else S.out.push([inp.seq, mx, mz, inp.jump ? 1 : 0]);
        moving = len > 0;
      }
      if (S.acc > Sim.DT * 6) S.acc = 0;
      if (!S.room && S.out.length && t - S.flushed > 30 && S.ws && S.ws.readyState === 1) { S.ws.send(JSON.stringify({ t: 'in', i: S.out })); S.out = []; S.flushed = t; }
      if (n) S.moving = moving;
      pose(S.me.av, b.x, b.y, b.z, b.face, S.moving && b.grounded && b.stun <= 0, dt, S.tool === 2);
      const cp = Math.cos(S.pitch), ty = b.y + 3;
      S.cam.position.set(b.x + Math.sin(S.yaw) * cp * S.dist, ty + Math.sin(S.pitch) * S.dist, b.z + Math.cos(S.yaw) * cp * S.dist);
      S.cam.lookAt(b.x, ty, b.z);
    }
    const rt = performance.now() - DELAY;
    S.ents.forEach(e => {
      const q = e.buf; if (!q.length) return;
      let i = q.length - 1; while (i > 0 && q[i].t > rt) i--;
      const a = q[i], c = q[i + 1] || a, k = c === a ? 0 : Math.max(0, Math.min(1, (rt - a.t) / (c.t - a.t)));
      let df = c.f - a.f; if (df > Math.PI) df -= 2 * Math.PI; if (df < -Math.PI) df += 2 * Math.PI;
      const far = Math.abs(c.x - a.x) + Math.abs(c.y - a.y) + Math.abs(c.z - a.z) > 20; // a respawn: jump there, do not slide
      e.av.g.visible = true;
      if (far) pose(e.av, c.x, c.y, c.z, c.f, false, dt, false);
      else pose(e.av, a.x + (c.x - a.x) * k, a.y + (c.y - a.y) * k, a.z + (c.z - a.z) * k, a.f + df * k, !!c.mv, dt, false);
    });
    S.renderer.render(S.scene, S.cam);
  }

  function start(el, place, opts) {
    stop();
    opts = opts || {};
    el.innerHTML = '<canvas></canvas><div class="hud tl"></div><div class="hud tr"></div><div class="hud chat"><div class="log"></div><input type="text" id="game-chat" maxlength="120" placeholder="Press Enter to chat" autocomplete="off" aria-label="Chat"></div><div class="hud bot"></div>';
    const canvas = el.querySelector('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const scene = new THREE.Scene(); scene.background = new THREE.Color(place.sky); scene.fog = new THREE.Fog(place.sky, 90, 220);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, .85));
    const sun = new THREE.DirectionalLight(0xffffff, .65); sun.position.set(40, 80, 30); scene.add(sun);
    S = { el, canvas, renderer, scene, place, opts, cam: new THREE.PerspectiveCamera(60, 1, .1, 500), world: { bricks: [], plate: false, half: 0 }, pick: [], ents: new Map(), names: new Map(), scores: [], mat: {}, stud: studTexture(),
      me: null, myId: 0, room: null, ws: null, pending: [], out: [], seq: 0, acc: 0, flushed: 0, moving: false,
      keys: {}, yaw: 0, pitch: .45, dist: 22, tool: place.id === 'arena' ? 2 : 0, size: 2, color: 0, rot: false, last: performance.now(),
      mouse: new THREE.Vector2(), caster: new THREE.Raycaster(), drag: null,
      hudTl: el.querySelector('.hud.tl'), hudTr: el.querySelector('.hud.tr'), hudBot: el.querySelector('.hud.bot'), chatLog: el.querySelector('.hud.chat .log'), chatIn: el.querySelector('#game-chat') };
    S.cam.position.set(0, 14, 28); S.cam.lookAt(0, 3, 0);
    S.ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: .45, depthWrite: false })); S.ghost.visible = false; scene.add(S.ghost);

    const size = () => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h || !S) return; renderer.setSize(w, h, false); S.cam.aspect = w / h; S.cam.updateProjectionMatrix(); };
    S.ro = new ResizeObserver(size); S.ro.observe(el); size();

    S.onKey = e => {
      if (e.target === S.chatIn) {
        if (e.type !== 'keydown') return;
        if (e.code === 'Enter' || e.code === 'NumpadEnter') { const text = S.chatIn.value.trim(); S.chatIn.value = ''; S.chatIn.blur(); if (text) send({ t: 'chat', text }); e.preventDefault(); }
        else if (e.code === 'Escape') S.chatIn.blur();
        return;
      }
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName || '')) return;
      const down = e.type === 'keydown'; S.keys[e.code] = down;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!down || e.repeat) return;
      if (e.code === 'Enter' || e.code === 'Slash') { S.keys = {}; S.chatIn.focus(); e.preventDefault(); }
      else if (e.code === 'Digit1') setTool(0); else if (e.code === 'Digit2') setTool(1); else if (e.code === 'Digit3') setTool(2);
      else if (e.code === 'KeyR') { S.rot = !S.rot; hud(); }
      else if (e.code === 'KeyQ') { S.size = (S.size + Sim.SIZES.length - 1) % Sim.SIZES.length; hud(); }
      else if (e.code === 'KeyE') { S.size = (S.size + 1) % Sim.SIZES.length; hud(); }
    };
    S.onBlur = () => { if (S) S.keys = {}; };
    window.addEventListener('keydown', S.onKey); window.addEventListener('keyup', S.onKey); window.addEventListener('blur', S.onBlur);
    S.chatIn.addEventListener('focus', () => { if (S) S.keys = {}; });

    canvas.addEventListener('pointerdown', e => { if (!S) return; S.drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, btn: e.button }; try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ } });
    canvas.addEventListener('pointermove', e => {
      if (!S) return; const d = S.drag;
      if (!d) { ghost(e); return; }
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 5) d.moved = true;
      if (d.moved) { S.yaw -= (e.clientX - d.x) * .006; S.pitch = Math.max(.05, Math.min(1.45, S.pitch + (e.clientY - d.y) * .006)); S.ghost.visible = false; }
      d.x = e.clientX; d.y = e.clientY;
    });
    canvas.addEventListener('pointerup', e => { if (!S) return; const d = S.drag; S.drag = null; if (d && !d.moved && d.btn === 0) act(e); });
    canvas.addEventListener('pointerleave', () => { if (S) S.ghost.visible = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => { e.preventDefault(); if (S) S.dist = Math.max(6, Math.min(70, S.dist * (e.deltaY > 0 ? 1.1 : .9))); }, { passive: false });
    S.hudBot.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || !S) return; const d = b.dataset;
      if (d.t) setTool(+d.t); else if (d.s) { S.size = +d.s; hud(); } else if (d.c) { S.color = +d.c; hud(); } else if (d.rot) { S.rot = !S.rot; hud(); }
      else if (d.reset) { try { localStorage.removeItem('kubox-sandbox'); } catch (err) { /* storage unavailable */ } return start(el, place, opts); }
      b.blur();
    });

    status(); hud();
    if (opts.online) {
      const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + location.pathname.replace(/[^/]*$/, '') + 'ws?place=' + encodeURIComponent(place.id));
      S.ws = ws;
      ws.onmessage = e => { if (S && S.ws === ws) { let m; try { m = JSON.parse(e.data); } catch (err) { return; } onMsg(m); } };
      ws.onclose = e => { if (S && S.ws === ws) lost(e); };
    } else {
      let saved; if (place.id === 'sandbox') { try { saved = JSON.parse(localStorage.getItem('kubox-sandbox') || 'null'); } catch (e) { saved = null; } }
      // An older save format stored rows without an owner; the Room accepts both.
      S.room = new Sim.Room(place.id, { bricks: Array.isArray(saved) && saved.length ? saved : undefined, emit: (target, m) => { if (S && (target === null || target === S.localId)) onMsg(m); } });
      S.localId = S.room.nextId;
      S.room.join({ name: opts.name || 'Guest', colors: colours(opts.colors), hat: opts.hat, role: 'admin', userId: 1 });
    }
    S.raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (!S) return;
    const s = S; S = null;
    cancelAnimationFrame(s.raf); s.ro.disconnect();
    window.removeEventListener('keydown', s.onKey); window.removeEventListener('keyup', s.onKey); window.removeEventListener('blur', s.onBlur);
    if (s.ws) { try { s.ws.close(); } catch (e) { /* already closed */ } }
    s.renderer.dispose();
  }
  return { start, stop, _state: () => S };
})();
