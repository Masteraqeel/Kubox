/* Kubox prototype: single player brick sandbox on three.js. 1 unit = 1 stud. Bricks sit on an integer grid. */
window.KBGame = (function () {
  let S = null;
  const COLORS = ['#d9342b', '#f5b800', '#2fa84f', '#2b6fd9', '#f2f2ee', '#3a3f4b', '#e07b1a', '#8a4fd1'];
  const SIZES = [[1, 1, 1], [2, 1, 2], [4, 1, 2], [1, 4, 1], [4, 4, 1]];
  const R = 0.7, H = 3.5, SPEED = 16, JUMP = 24, GRAV = 70;
  const BOTS = ['brickwarden', 'Vexley', 'TinCanTom', 'ohmlette', 'SgtHalden', 'quartzmoth'];

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
      const top = new THREE.MeshLambertMaterial({ color, map });
      S.mat[k] = [side, side, top, side, side, side];
    }
    return S.mat[k];
  }
  function addBrick(x, y, z, w, h, d, color, locked) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats(color, w, d));
    mesh.position.set(x + w / 2, y + h / 2, z + d / 2);
    const b = { x, y, z, w, h, d, color, locked: !!locked, mesh }; mesh.userData.brick = b;
    S.scene.add(mesh); S.bricks.push(b); S.pick.push(mesh); return b;
  }
  function removeBrick(b) {
    S.scene.remove(b.mesh); b.mesh.geometry.dispose();
    S.bricks.splice(S.bricks.indexOf(b), 1); S.pick.splice(S.pick.indexOf(b.mesh), 1);
  }
  function makeAvatar(c) {
    const g = new THREE.Group(), m = col => new THREE.MeshLambertMaterial({ color: col });
    const box = (w, h, d, x, y, z, mat, par) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); o.position.set(x, y, z); (par || g).add(o); return o; };
    const fl = box(.6, .7, .9, -.4, .35, 0, m(c[2])), fr = box(.6, .7, .9, .4, .35, 0, m(c[2]));
    box(1.5, 1.4, .9, 0, 1.4, 0, m(c[1])); box(.4, 1.2, .5, -.97, 1.45, 0, m(c[1]));
    const arm = new THREE.Group(); arm.position.set(.97, 2.0, 0); g.add(arm); box(.4, 1.2, .5, 0, -.55, 0, m(c[1]), arm);
    const sword = box(.18, .3, 2.8, 0, -1.1, 1.3, m('#cfd6e0'), arm); sword.visible = false;
    box(1.5, 1.4, 1.5, 0, 2.8, 0, m(c[0])); box(1.2, .4, .1, 0, 2.85, .76, m('#1b2233'));
    return { g, fl, fr, arm, sword };
  }
  function body(name, x, y, z, wander) {
    const av = makeAvatar(window.KB.users[name].c); S.scene.add(av.g);
    return { name, av, p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(), spawn: [x, y, z], wander, face: 0, walk: 0, heading: Math.random() * 6.28, think: 0, stun: 0, kx: 0, kz: 0, kos: 0, outs: 0 };
  }

  /* ---------- physics: axis by axis box tests against every brick ---------- */
  function hits(x, y, z) {
    for (const k of S.bricks) if (x + R > k.x && x - R < k.x + k.w && y + H > k.y && y < k.y + k.h && z + R > k.z && z - R < k.z + k.d) return k;
    return null;
  }
  function stepBody(b, dt) {
    let x = b.p.x, y = b.p.y, z = b.p.z; b.blocked = false;
    for (const ax of ['x', 'z']) {
      const nx = ax === 'x' ? x + b.v.x * dt : x, nz = ax === 'z' ? z + b.v.z * dt : z, k = hits(nx, y, nz);
      if (!k) { x = nx; z = nz; }
      else { const top = k.y + k.h; if (top - y <= 1.01 && !hits(nx, top, nz)) { x = nx; z = nz; y = top; } else b.blocked = true; }
    }
    b.v.y = Math.max(b.v.y - GRAV * dt, -80);
    let ny = y + b.v.y * dt; b.grounded = false;
    const k = hits(x, ny, z);
    if (k) { if (b.v.y <= 0) { ny = k.y + k.h; b.grounded = true; } else ny = k.y - H; b.v.y = 0; }
    if (S.plate && ny <= 0 && y >= 0 && Math.abs(x) <= S.half && Math.abs(z) <= S.half) { ny = 0; b.v.y = 0; b.grounded = true; }
    b.p.set(x, ny, z);
  }
  function pose(b, dt, moving) {
    b.av.g.position.copy(b.p); b.av.g.rotation.y = b.face;
    b.walk += dt * (moving && b.grounded ? 12 : 0); const s = moving && b.grounded ? Math.sin(b.walk) * .35 : 0;
    b.av.fl.position.z = s; b.av.fr.position.z = -s;
  }

  /* ---------- places ---------- */
  function buildPlace(id) {
    const B = addBrick;
    if (id !== 'arena') {
      const map = S.stud.clone(); map.needsUpdate = true; map.repeat.set(128, 128);
      const side = new THREE.MeshLambertMaterial({ color: '#3d7f41' }), top = new THREE.MeshLambertMaterial({ color: '#4a9b4f', map });
      S.plate = new THREE.Mesh(new THREE.BoxGeometry(128, 1, 128), [side, side, top, side, side, side]);
      S.plate.position.y = -.5; S.scene.add(S.plate); S.pick.push(S.plate); S.half = 64;
    }
    if (id === 'sandbox') {
      let saved = null; try { saved = JSON.parse(localStorage.getItem('kubox-sandbox') || 'null'); } catch (e) { saved = null; }
      if (saved && saved.length) saved.forEach(a => B(a[0], a[1], a[2], a[3], a[4], a[5], a[6]));
      else starter();
      S.spawn = [0, 3, 6];
    } else if (id === 'training') {
      B(-6, 0, -26, 12, 2, 5, '#3a3f4b'); B(-2, 2, -25, 4, 1, 3, '#f5b800'); B(-8, 0, -24, 2, 1, 2, '#3a3f4b');
      B(-10, 0, -27, 1, 4, 1, '#f2f2ee'); B(-10, 4, -27, 1, 4, 1, '#f2f2ee'); B(-9, 6, -27, 3, 2, 1, '#3a5f3a');
      for (let i = 0; i < 6; i++) { B(-11 + i * 4, 0, -12, 2, 1, 2, '#f5b800'); S.bots.push(body(BOTS[i], -10 + i * 4, 1, -11, false)); }
      for (let i = 0; i < 6; i++) B(20, 0, -16 + i * 3, 6, i + 1, 3, i % 2 ? '#2b6fd9' : '#f2f2ee');
      [[20, 5], [20, 12], [14, 18], [6, 18]].forEach((q, i) => B(q[0], 5, q[1], 4, 1, 4, i % 2 ? '#e07b1a' : '#d9342b'));
      B(-2, 0, 16, 6, 6, 6, '#2fa84f'); B(-1, 6, 17, 4, 1, 4, '#f5b800');
      for (let i = 0; i < 5; i++) B(-20, 0, 2 + i * 5, 8, 2 + (i % 2) * 2, 1, '#3a3f4b');
      S.spawn = [0, 1, 0]; S.bots.forEach(b => { b.face = Math.PI; });
    } else {
      B(-20, 0, -20, 40, 2, 40, '#3a3f4b', true);
      [[-20, -20, '#d9342b'], [16, -20, '#2b6fd9'], [-20, 16, '#2b6fd9'], [16, 16, '#d9342b']].forEach(q => B(q[0], 2, q[1], 4, 5, 4, q[2]));
      B(-2, 2, -2, 4, 1, 4, '#f5b800'); B(-1, 3, -1, 2, 3, 2, '#f5b800');
      B(-12, 2, -1, 6, 2, 2, '#f2f2ee'); B(6, 2, -1, 6, 2, 2, '#f2f2ee'); B(-1, 2, -12, 2, 2, 6, '#f2f2ee'); B(-1, 2, 6, 2, 2, 6, '#f2f2ee');
      for (let i = 0; i < 5; i++) { const a = i * 1.26; S.bots.push(body(BOTS[i], Math.cos(a) * 13.5, 2, Math.sin(a) * 13.5, true)); }
      S.spawn = [0, 4, 14]; S.bound = 18;
    }
  }
  function starter() {
    const B = addBrick;
    B(-2, 0, 4, 4, 1, 4, '#f5b800');
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3 - (i % 2); j++) B(-12 + i * 4 + (j % 2) * 2, j, -8, 4, 1, 2, COLORS[(i + j) % 4]);
    for (let i = 0; i < 4; i++) B(14, 0, -6 + i * 2, 4, i + 1, 2, COLORS[4 + (i % 2)]);
    B(-16, 0, 2, 1, 4, 1, '#f2f2ee'); B(-11, 0, 2, 1, 4, 1, '#f2f2ee'); B(-16, 4, 2, 6, 1, 1, '#d9342b');
  }
  function saveSandbox() {
    if (S.place.id !== 'sandbox') return;
    try { localStorage.setItem('kubox-sandbox', JSON.stringify(S.bricks.map(b => [b.x, b.y, b.z, b.w, b.h, b.d, b.color]))); } catch (e) { /* storage unavailable */ }
  }

  /* ---------- tools ---------- */
  function ray(e) {
    const r = S.canvas.getBoundingClientRect();
    S.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    S.caster.setFromCamera(S.mouse, S.cam);
    return S.caster.intersectObjects(S.pick, false)[0] || null;
  }
  function placement(hit) {
    const n = hit.face.normal, p = hit.point, s = SIZES[S.size], w = S.rot ? s[2] : s[0], h = s[1], d = S.rot ? s[0] : s[2];
    let x = Math.floor(p.x + n.x * .5), y = Math.floor(p.y + n.y * .5), z = Math.floor(p.z + n.z * .5);
    if (n.x < -.5) x -= w - 1; if (n.y < -.5) y -= h - 1; if (n.z < -.5) z -= d - 1;
    let ok = y >= 0 && S.bricks.length < 1500;
    if (ok) for (const k of S.bricks) if (x < k.x + k.w && x + w > k.x && y < k.y + k.h && y + h > k.y && z < k.z + k.d && z + d > k.z) { ok = false; break; }
    const q = S.me.p; if (ok && q.x + R > x && q.x - R < x + w && q.y + H > y && q.y < y + h && q.z + R > z && q.z - R < z + d) ok = false;
    return { x, y, z, w, h, d, ok };
  }
  function ghost(e) {
    const hit = S.tool === 0 && e ? ray(e) : null;
    if (!hit) { S.ghost.visible = false; return; }
    const g = placement(hit); S.ghost.visible = true; S.ghost.scale.set(g.w, g.h, g.d);
    S.ghost.position.set(g.x + g.w / 2, g.y + g.h / 2, g.z + g.d / 2); S.ghost.material.color.set(g.ok ? COLORS[S.color] : '#ff2222');
  }
  function act(e) {
    if (S.tool === 2) { swing(); return; }
    const hit = ray(e); if (!hit) return;
    if (S.tool === 0) { const g = placement(hit); if (g.ok) { addBrick(g.x, g.y, g.z, g.w, g.h, g.d, COLORS[S.color]); saveSandbox(); ghost(e); } }
    else { const b = hit.object.userData.brick; if (b && !b.locked) { removeBrick(b); saveSandbox(); } }
  }
  function swing() {
    if (S.swing > 0) return; S.swing = .3;
    const fx = Math.sin(S.me.face), fz = Math.cos(S.me.face);
    for (const b of S.bots) {
      const dx = b.p.x - S.me.p.x, dz = b.p.z - S.me.p.z, dist = Math.hypot(dx, dz);
      if (dist < 6 && Math.abs(b.p.y - S.me.p.y) < 4 && (dx * fx + dz * fz) / (dist || 1) > .2) { b.kx = fx * 34; b.kz = fz * 34; b.v.y = 20; b.stun = .7; b.hitBy = true; }
    }
  }
  function setTool(i) { S.tool = i; S.me.av.sword.visible = i === 2; S.ghost.visible = false; hud(); }

  /* ---------- hud ---------- */
  function hud() {
    const names = ['1 Build', '2 Delete', '3 Sword'];
    let h = `<div class="hot">${names.map((n, i) => `<button data-t="${i}" class="${S.tool === i ? 'on' : ''}">${n}</button>`).join('')}${S.place.id === 'sandbox' ? '<button data-reset="1">Reset build</button>' : ''}</div>`;
    if (S.tool === 0) h += `<div class="hot">${SIZES.map((s, i) => `<button data-s="${i}" class="${S.size === i ? 'on' : ''}">${s[0]}x${s[1]}x${s[2]}</button>`).join('')}<button data-rot="1" class="${S.rot ? 'on' : ''}">R Rotate</button></div><div class="hot">${COLORS.map((c, i) => `<button class="sw${S.color === i ? ' on' : ''}" data-c="${i}" style="background:${c}" aria-label="Colour ${i + 1}"></button>`).join('')}</div>`;
    S.hudBot.innerHTML = h;
  }
  function board() {
    const rows = [S.me].concat(S.bots).map(b => `<tr><td>${b.name}</td><td class="c">${b.kos}</td><td class="c">${b.outs}</td></tr>`).join('');
    S.hudTr.innerHTML = `<table><tr><th>Player</th><th class="c">KOs</th><th class="c">Falls</th></tr>${rows}</table>`;
  }

  /* ---------- loop ---------- */
  function frame(t) {
    if (!S) return; S.raf = requestAnimationFrame(frame);
    const dt = Math.max(0, Math.min(.033, (t - S.last) / 1000 || 0)); S.last = t;
    const K = S.keys, f = (K.KeyW || K.ArrowUp ? 1 : 0) - (K.KeyS || K.ArrowDown ? 1 : 0), r = (K.KeyD || K.ArrowRight ? 1 : 0) - (K.KeyA || K.ArrowLeft ? 1 : 0);
    const me = S.me; let mx = -Math.sin(S.yaw) * f + Math.cos(S.yaw) * r, mz = -Math.cos(S.yaw) * f - Math.sin(S.yaw) * r; const len = Math.hypot(mx, mz);
    if (len > 0) { mx /= len; mz /= len; me.face = Math.atan2(mx, mz); }
    me.v.x = mx * SPEED; me.v.z = mz * SPEED;
    if (K.Space && me.grounded) me.v.y = JUMP;
    stepBody(me, dt); pose(me, dt, len > 0);
    if (S.swing > 0) { S.swing -= dt; me.av.arm.rotation.x = -Math.sin(Math.max(0, 1 - S.swing / .3) * Math.PI) * 1.9; } else me.av.arm.rotation.x = S.tool === 2 ? -.5 : 0;
    if (me.p.y < -45) { me.p.set(S.spawn[0], S.spawn[1] + 4, S.spawn[2]); me.v.set(0, 0, 0); me.outs++; board(); }

    for (const b of S.bots) {
      let moving = false;
      if (b.stun > 0) { b.stun -= dt; b.v.x = b.kx; b.v.z = b.kz; b.kx *= .96; b.kz *= .96; }
      else if (b.wander && b.grounded) {
        b.think -= dt; const nx = b.p.x + Math.sin(b.heading) * 2.5, nz = b.p.z + Math.cos(b.heading) * 2.5;
        if (b.think <= 0 || b.blocked) { b.heading = Math.random() * 6.28; b.think = 1 + Math.random() * 3; }
        if (S.bound && (Math.abs(nx) > S.bound || Math.abs(nz) > S.bound) && Math.random() > .004) b.heading = Math.atan2(-b.p.x, -b.p.z) + (Math.random() - .5);
        b.v.x = Math.sin(b.heading) * 6; b.v.z = Math.cos(b.heading) * 6; b.face = b.heading; moving = true;
      } else if (b.grounded) { b.v.x = 0; b.v.z = 0; }
      stepBody(b, dt); pose(b, dt, moving);
      if (b.p.y < -45) { if (b.hitBy) me.kos++; b.outs++; b.hitBy = false; b.p.set(b.spawn[0], b.spawn[1] + 6, b.spawn[2]); b.v.set(0, 0, 0); b.stun = 0; board(); }
      else if (b.grounded && b.stun <= 0) b.hitBy = false;
    }

    const cp = Math.cos(S.pitch), tx = me.p.x, ty = me.p.y + 3, tz = me.p.z;
    S.cam.position.set(tx + Math.sin(S.yaw) * cp * S.dist, ty + Math.sin(S.pitch) * S.dist, tz + Math.cos(S.yaw) * cp * S.dist);
    S.cam.lookAt(tx, ty, tz);
    S.renderer.render(S.scene, S.cam);
  }

  function start(el, place) {
    stop();
    el.innerHTML = '<canvas></canvas><div class="hud tl"></div><div class="hud tr"></div><div class="hud bot"></div>';
    const canvas = el.querySelector('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const scene = new THREE.Scene(); scene.background = new THREE.Color(place.sky); scene.fog = new THREE.Fog(place.sky, 90, 220);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, .85));
    const sun = new THREE.DirectionalLight(0xffffff, .65); sun.position.set(40, 80, 30); scene.add(sun);
    S = { el, canvas, renderer, scene, place, cam: new THREE.PerspectiveCamera(60, 1, .1, 500), bricks: [], pick: [], bots: [], mat: {}, stud: studTexture(),
      keys: {}, yaw: 0, pitch: .45, dist: 22, tool: place.id === 'arena' ? 2 : 0, size: 2, color: 0, rot: false, swing: 0, last: performance.now(),
      mouse: new THREE.Vector2(), caster: new THREE.Raycaster(), drag: null, plate: null, half: 0, bound: 0,
      hudBot: el.querySelector('.hud.bot'), hudTr: el.querySelector('.hud.tr') };
    S.ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: .45, depthWrite: false })); S.ghost.visible = false; scene.add(S.ghost);
    buildPlace(place.id);
    S.me = body(window.KB.me, S.spawn[0], S.spawn[1], S.spawn[2], false); S.me.face = Math.PI;
    S.me.av.sword.visible = S.tool === 2;
    el.querySelector('.hud.tl').innerHTML = `<b>${place.name}</b><br>${place.id === 'arena' ? 'Click to swing. Knock the others off the platform.' : place.id === 'training' ? 'Recruits are lined up. Take the podium or run the course.' : 'Click to place a brick. Your build saves in this browser.'}`;
    hud(); board();

    const size = () => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); S.cam.aspect = w / h; S.cam.updateProjectionMatrix(); };
    S.ro = new ResizeObserver(size); S.ro.observe(el); size();

    S.onKey = e => {
      if (/INPUT|TEXTAREA|SELECT/.test((e.target.tagName || ''))) return;
      const down = e.type === 'keydown'; S.keys[e.code] = down;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!down || e.repeat) return;
      if (e.code === 'Digit1') setTool(0); else if (e.code === 'Digit2') setTool(1); else if (e.code === 'Digit3') setTool(2);
      else if (e.code === 'KeyR') { S.rot = !S.rot; hud(); }
      else if (e.code === 'KeyQ') { S.size = (S.size + SIZES.length - 1) % SIZES.length; hud(); }
      else if (e.code === 'KeyE') { S.size = (S.size + 1) % SIZES.length; hud(); }
    };
    S.onBlur = () => { S.keys = {}; };
    window.addEventListener('keydown', S.onKey); window.addEventListener('keyup', S.onKey); window.addEventListener('blur', S.onBlur);

    canvas.addEventListener('pointerdown', e => { S.drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, btn: e.button }; try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ } });
    canvas.addEventListener('pointermove', e => {
      const d = S && S.drag; if (!S) return;
      if (!d) { ghost(e); return; }
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 5) d.moved = true;
      if (d.moved) { S.yaw -= (e.clientX - d.x) * .006; S.pitch = Math.max(.05, Math.min(1.45, S.pitch + (e.clientY - d.y) * .006)); S.ghost.visible = false; }
      d.x = e.clientX; d.y = e.clientY;
    });
    canvas.addEventListener('pointerup', e => { if (!S) return; const d = S.drag; S.drag = null; if (d && !d.moved && d.btn === 0) act(e); });
    canvas.addEventListener('pointerleave', () => { if (S) S.ghost.visible = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => { e.preventDefault(); S.dist = Math.max(6, Math.min(70, S.dist * (e.deltaY > 0 ? 1.1 : .9))); }, { passive: false });
    S.hudBot.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
      if (d.t) setTool(+d.t); else if (d.s) { S.size = +d.s; hud(); } else if (d.c) { S.color = +d.c; hud(); } else if (d.rot) { S.rot = !S.rot; hud(); }
      else if (d.reset) { S.bricks.slice().forEach(removeBrick); try { localStorage.removeItem('kubox-sandbox'); } catch (err) { /* storage unavailable */ } starter(); }
      b.blur();
    });
    S.raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (!S) return;
    cancelAnimationFrame(S.raf); S.ro.disconnect();
    window.removeEventListener('keydown', S.onKey); window.removeEventListener('keyup', S.onKey); window.removeEventListener('blur', S.onBlur);
    S.renderer.dispose(); S = null;
  }
  return { start, stop, _state: () => S };
})();
