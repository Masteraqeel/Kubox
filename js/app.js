/* Kubox prototype: website shell. Hash routes use plain names such as #forum-clans or #item-3. */
(function () {
  const D = window.KB, ME = D.me;
  const main = document.getElementById('main');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Number(n).toLocaleString('en-US');

  /* ---------- state kept in this browser only ---------- */
  let st = {};
  try { st = JSON.parse(localStorage.getItem('kubox-state') || '{}') || {}; } catch (e) { st = {}; }
  st.replies = st.replies || {}; st.walls = st.walls || {}; st.sold = st.sold || {}; st.ts = st.ts || {};
  st.joined = st.joined || D.myGroups.slice();
  st.inv = st.inv || D.inventory[ME].map(a => a.slice());
  st.trades = st.trades || [];
  if (typeof st.bits !== 'number') st.bits = D.bits;
  const save = () => { try { localStorage.setItem('kubox-state', JSON.stringify(st)); } catch (e) { /* storage unavailable */ } };
  let filter = 'All', tr = { partner: 'novaquill', give: [], get: [] };

  const item = id => D.items.find(i => i.id === +id);
  const group = id => D.groups.find(g => g.id === id);
  const invOf = u => (u === ME ? st.inv : D.inventory[u] || []);
  const val = e => { const it = item(e[0]); return it.limited ? it.rap : it.price; };
  const label = e => { const it = item(e[0]); return esc(it.name) + (it.limited ? ' #' + e[1] : ''); };
  const now = () => 'Just now';

  function toast(msg) {
    const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ---------- drawn art ---------- */
  function avatar(name, s) {
    s = s || 48; const c = (D.users[name] || { c: ['#999', '#666', '#444'] }).c;
    return `<svg class="av" width="${s}" height="${s}" viewBox="0 0 64 64" role="img" aria-label="${esc(name)}"><rect width="64" height="64" fill="#cfe6f7"/><rect y="54" width="64" height="10" fill="#4a9b4f"/><rect x="20" y="46" width="10" height="9" fill="${c[2]}"/><rect x="34" y="46" width="10" height="9" fill="${c[2]}"/><rect x="11" y="31" width="7" height="13" fill="${c[1]}"/><rect x="46" y="31" width="7" height="13" fill="${c[1]}"/><rect x="18" y="30" width="28" height="17" fill="${c[1]}"/><rect x="16" y="6" width="32" height="25" rx="2" fill="${c[0]}"/><rect x="20" y="14" width="24" height="8" rx="1" fill="#1b2233"/><rect x="23" y="16" width="6" height="4" fill="#7fe3ff"/><rect x="35" y="16" width="6" height="4" fill="#7fe3ff"/></svg>`;
  }
  const SH = {
    tophat: c => `<rect x="10" y="46" width="44" height="6" fill="${c}"/><rect x="18" y="14" width="28" height="32" fill="${c}"/><rect x="18" y="36" width="28" height="5" fill="#1b2233"/>`,
    crown: c => `<polygon points="12,48 12,22 22,34 32,16 42,34 52,22 52,48" fill="${c}"/><circle cx="20" cy="42" r="3" fill="#fff"/><circle cx="32" cy="42" r="3" fill="#fff"/><circle cx="44" cy="42" r="3" fill="#fff"/>`,
    visor: c => `<rect x="10" y="22" width="44" height="18" rx="4" fill="${c}"/><rect x="15" y="27" width="34" height="7" fill="#1b2233"/>`,
    horns: c => `<polygon points="14,46 8,14 28,40" fill="${c}"/><polygon points="50,46 56,14 36,40" fill="${c}"/><rect x="14" y="44" width="36" height="6" fill="#1b2233"/>`,
    banner: c => `<rect x="16" y="8" width="4" height="48" fill="#5b6577"/><polygon points="20,10 54,17 20,34" fill="${c}"/>`,
    blade: c => `<polygon points="29,6 35,6 37,40 27,40" fill="${c}"/><rect x="20" y="40" width="24" height="5" fill="#f5b800"/><rect x="29" y="45" width="6" height="12" fill="#1b2233"/>`,
    sword: c => `<polygon points="29,8 35,8 36,40 28,40" fill="${c}"/><rect x="22" y="40" width="20" height="4" fill="#7a5a30"/><rect x="29" y="44" width="6" height="12" fill="#7a5a30"/>`,
    cap: c => `<path d="M12 42a18 18 0 0 1 36 0z" fill="${c}"/><rect x="34" y="40" width="22" height="5" fill="${c}"/><rect x="12" y="40" width="22" height="5" fill="#1b2233" opacity=".25"/>`,
    cone: c => `<polygon points="32,8 46,48 18,48" fill="${c}"/><polygon points="27,22 37,22 40,31 24,31" fill="#fff"/><rect x="12" y="48" width="40" height="6" fill="${c}"/>`,
    shades: c => `<rect x="9" y="26" width="19" height="13" rx="2" fill="${c}"/><rect x="36" y="26" width="19" height="13" rx="2" fill="${c}"/><rect x="28" y="29" width="8" height="3" fill="${c}"/>`
  };
  const icon = it => `<svg viewBox="0 0 64 64" role="img" aria-label="${esc(it.name)}"><rect width="64" height="64" fill="#eef1f5"/>${SH[it.shape](it.col)}</svg>`;
  function thumb(g) {
    const b = g.blocks, blk = (x, y, w, h, c) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/><rect x="${x}" y="${y}" width="${w}" height="6" fill="#fff" opacity=".28"/>`;
    return `<svg viewBox="0 0 320 180" role="img" aria-label="${esc(g.name)}"><rect width="320" height="180" fill="${g.sky}"/><polygon points="0,130 320,118 320,180 0,180" fill="${g.id === 'arena' ? '#3a3f4b' : '#4a9b4f'}"/>${blk(40, 78, 60, 52, b[0])}${blk(100, 98, 44, 30, b[1])}${blk(214, 58, 46, 66, b[2])}${blk(260, 92, 34, 30, b[0])}<rect x="158" y="96" width="22" height="18" fill="#2b6fd9"/><rect x="156" y="74" width="26" height="22" rx="2" fill="#f5b800"/><rect x="160" y="81" width="18" height="6" fill="#1b2233"/><rect x="160" y="114" width="8" height="8" fill="#1d2b4f"/><rect x="171" y="114" width="8" height="8" fill="#1d2b4f"/></svg>`;
  }
  function chart(h) {
    const W = 320, H = 110, L = 44, R = 12, T = 12, B = 18, lo = Math.min(...h), hi = Math.max(...h), sp = hi - lo || 1;
    const x = i => L + i * (W - L - R) / (h.length - 1), y = v => T + (hi - v) * (H - T - B) / sp;
    const pts = h.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
    const mid = (lo + hi) / 2;
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Sale price over the last ${h.length} sales" style="width:100%;height:auto;display:block">
      ${[hi, mid, lo].map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#dfe4ea"/><text x="${L - 6}" y="${y(v) + 3}" text-anchor="end" font-size="9" fill="#5b6577">${fmt(Math.round(v))}</text>`).join('')}
      <polygon points="${L},${H - B} ${pts} ${W - R},${H - B}" fill="#2b6fd9" opacity=".14"/><polyline points="${pts}" fill="none" stroke="#2b6fd9" stroke-width="2"/>
      <circle cx="${x(h.length - 1)}" cy="${y(h[h.length - 1])}" r="4" fill="#f5b800" stroke="#1d2b4f" stroke-width="1.5"/>
      <text x="${L}" y="${H - 5}" font-size="9" fill="#5b6577">${h.length} sales ago</text><text x="${W - R}" y="${H - 5}" text-anchor="end" font-size="9" fill="#5b6577">latest sale</text></svg>`;
  }
  const emblem = (g, sm) => `<span class="emblem${sm ? ' sm' : ''}" style="background:${g.col};color:${g.col2};border-color:${g.col2}">${esc(g.tag)}</span>`;
  const bits = n => `<span class="price num"><i class="coin"></i>${fmt(n)}</span>`;
  const ulink = u => `<a href="${u === ME ? '#profile' : '#user-' + u}">${esc(u)}</a>`;
  const panel = (title, body, more) => `<section class="panel"><h2><span>${title}</span>${more || ''}</h2>${body}</section>`;
  const gameByName = n => D.games.find(g => g.name === n);

  /* ---------- views ---------- */
  const V = {};

  V.home = () => {
    const me = D.users[ME];
    const shouts = D.groups.filter(g => st.joined.includes(g.id)).map(g => `<div class="row">${emblem(g, 1)}<div><a href="#group-${g.id}"><b>${esc(g.name)}</b></a> <span class="muted small">${ulink(g.shout.u)} · ${g.shout.t}</span><div>${esc(g.shout.body)}</div></div></div>`).join('');
    const latest = D.threads.slice(0, 6).map(t => { const p = t.posts[t.posts.length - 1]; return `<div><a href="#thread-${t.id}">${esc(t.title)}</a><div class="muted small">${esc(p.u)} · ${p.t}</div></div>`; }).join('');
    const friends = D.friends.map(f => { const pl = D.users[f].playing, g = pl && gameByName(pl); return `<div class="row">${avatar(f, 32)}<div>${ulink(f)}<div class="small muted"><i class="dot${pl ? '' : ' off'}"></i>${g ? `<a href="#play-${g.id}">${esc(pl)}</a>` : 'Offline'}</div></div></div>`; }).join('');
    const ev = D.groups.filter(g => st.joined.includes(g.id)).flatMap(g => g.events.map(e => `<div><b>${e[0]}</b><div>${esc(e[1])}</div><div class="small muted">${esc(g.name)} · ${esc(e[2])}</div></div>`)).join('');
    return `<div class="head"><h1>Hello, ${esc(ME)}</h1><a class="btn play" href="#games">Play</a></div>
    <div class="cols">
      <div>${panel('You', `<div class="pad">${avatar(ME, 176).replace('width="176" height="176"', 'style="width:100%;height:auto"')}<div class="stat"><span>Bits</span>${bits(st.bits)}</div><div class="stat"><span>Forum posts</span><b class="num">${fmt(me.posts)}</b></div><div class="stat"><span>Limiteds</span><b class="num">${st.inv.filter(e => item(e[0]).limited).length}</b></div><div class="stat"><span>Groups</span><b class="num">${st.joined.length}</b></div></div>`)}</div>
      <div>${panel('Group shouts', `<div class="list">${shouts || '<div class="muted">Join a group to see its shouts here.</div>'}</div>`, '<a href="#groups">All groups</a>')}
        ${panel('Latest in the forum', `<div class="list">${latest}</div>`, '<a href="#forum">Forum</a>')}</div>
      <div>${panel('Friends', `<div class="list">${friends}</div>`)}${panel('Your events', `<div class="list">${ev || '<div class="muted">Nothing scheduled.</div>'}</div>`)}</div>
    </div>`;
  };

  V.games = () => `<div class="head"><h1>Games</h1><span class="muted">Three first-party places. Each one opens in this page.</span></div>
    <div class="grid wide">${D.games.map(g => `<div class="card"><a class="art" href="#play-${g.id}">${thumb(g)}</a><div class="meta"><a href="#play-${g.id}"><b>${esc(g.name)}</b></a><span class="muted small">by ${esc(g.by)}</span><span>${esc(g.desc)}</span><span class="small muted num"><i class="dot"></i>${g.playing} playing · ${g.visits} visits · ${g.likes}% liked</span><div><a class="btn play" href="#play-${g.id}">Play</a></div></div></div>`).join('')}</div>`;

  V.play = id => {
    const g = D.games.find(x => x.id === id) || D.games[0];
    setTimeout(() => {
      const el = document.getElementById('stage');
      if (!el) return;
      if (window.THREE && window.KBGame) { try { KBGame.start(el, g); } catch (e) { el.innerHTML = '<p class="pad">The 3D view could not start in this browser: ' + esc(e.message) + '</p>'; } }
      else el.innerHTML = '<p class="pad">The 3D library did not load. Check that vendor/three.min.js is present.</p>';
    }, 0);
    return `<div class="head"><h1>${esc(g.name)}</h1><a class="btn warn" href="#games">Leave game</a></div><div id="stage" class="stage"></div>
    <p class="muted small" style="margin-top:8px">Move with W A S D or the arrow keys. Space jumps. Drag to turn the camera, scroll to zoom. Keys 1, 2 and 3 pick a tool. A keyboard is required for now.</p>`;
  };

  V.forum = cat => {
    if (cat) {
      const c = D.cats.find(x => x.id === cat); if (!c) return V.forum();
      const rows = D.threads.filter(t => t.cat === cat).map(t => { const all = t.posts.concat(st.replies[t.id] || []), last = all[all.length - 1]; return `<tr><td>${t.pinned ? '<span class="pin">PINNED</span>' : ''}<a href="#thread-${t.id}"><b>${esc(t.title)}</b></a><div class="small muted">by ${ulink(t.posts[0].u)}</div></td><td class="c num">${all.length - 1}</td><td class="c num">${fmt(t.views)}</td><td class="small">${ulink(last.u)}<div class="muted">${last.t}</div></td></tr>`; }).join('');
      return `<div class="crumbs"><a href="#forum">Forum</a> › ${esc(c.name)}</div><div class="head"><h1>${esc(c.name)}</h1></div>
      <div class="panel scroll"><table><tr><th>Thread</th><th class="c">Replies</th><th class="c">Views</th><th>Last post</th></tr>${rows || '<tr><td colspan="4" class="muted">No sample threads in this board yet.</td></tr>'}</table></div>`;
    }
    const rows = D.cats.map(c => { const t = D.threads.find(x => x.cat === c.id); return `<tr><td><a href="#forum-${c.id}"><b>${esc(c.name)}</b></a><div class="small muted">${esc(c.desc)}</div></td><td class="c num">${fmt(c.threads)}</td><td class="c num">${fmt(c.posts)}</td><td class="small">${t ? `<a href="#thread-${t.id}">${esc(t.title)}</a>` : ''}</td></tr>`; }).join('');
    return `<div class="head"><h1>Forum</h1><span class="muted">The front page of the community.</span></div><div class="panel scroll"><table><tr><th>Board</th><th class="c">Threads</th><th class="c">Posts</th><th>Latest thread</th></tr>${rows}</table></div>`;
  };

  V.thread = id => {
    const t = D.threads.find(x => x.id === +id); if (!t) return V.forum();
    const c = D.cats.find(x => x.id === t.cat), all = t.posts.concat(st.replies[t.id] || []);
    const posts = all.map(p => { const u = D.users[p.u] || {}; return `<div class="post"><div class="who">${avatar(p.u, 64)}<div><b>${ulink(p.u)}</b><div class="muted">Posts: ${fmt(u.posts || 0)}</div><div class="muted">Joined: ${u.joined || ''}</div></div></div><div class="what"><div class="small muted">${p.t}</div><div class="body-text">${esc(p.body)}</div></div></div>`; }).join('');
    return `<div class="crumbs"><a href="#forum">Forum</a> › <a href="#forum-${c.id}">${esc(c.name)}</a></div><div class="head"><h1>${esc(t.title)}</h1></div>
    <div class="panel">${posts}</div>
    ${panel('Reply', `<form class="pad form" data-form="reply" data-id="${t.id}"><label for="reply-body" class="small muted">Posting as ${esc(ME)}</label><textarea id="reply-body" required maxlength="2000" placeholder="Write your reply"></textarea><button class="btn" type="submit">Post reply</button></form>`)}`;
  };

  V.groups = () => `<div class="head"><h1>Groups</h1><span class="muted">Clans, guilds and councils. Ranks, allies, enemies and a wall.</span></div>
    <div class="panel list">${D.groups.map(g => `<div class="row">${emblem(g)}<div style="flex:1"><a href="#group-${g.id}"><b>${esc(g.name)}</b></a> ${st.joined.includes(g.id) ? '<span class="pin">MEMBER</span>' : ''}<div>${esc(g.desc)}</div><div class="small muted num">${fmt(g.members)} members · owned by ${ulink(g.owner)} · <span class="ally">${g.allies.length} allies</span> · <span class="enemy">${g.enemies.length} enemies</span></div></div></div>`).join('')}</div>`;

  V.group = id => {
    const g = group(id); if (!g) return V.groups();
    const inG = st.joined.includes(g.id), wall = (st.walls[g.id] || []).concat(g.wall);
    const rel = (ids, cls) => ids.map(i => { const o = group(i); return `<a class="chip" href="#group-${o.id}">${emblem(o, 1)}<span class="${cls}">${esc(o.name)}</span></a>`; }).join('') || '<span class="muted">None</span>';
    const ev = g.events.map(e => { const pl = gameByName(e[2]); return `<tr><td class="num"><b>${e[0]}</b></td><td>${esc(e[1])}</td><td>${pl ? `<a href="#play-${pl.id}">${esc(e[2])}</a>` : esc(e[2])}</td></tr>`; }).join('');
    return `<div class="crumbs"><a href="#groups">Groups</a> › ${esc(g.name)}</div>
    <div class="panel pad row">${emblem(g)}<div style="flex:1"><h1>${esc(g.name)}</h1><div class="muted small num">${fmt(g.members + (inG && !D.myGroups.includes(g.id) ? 1 : 0))} members · owned by ${ulink(g.owner)}</div><p style="margin-top:6px">${esc(g.desc)}</p></div>
      <button class="btn ${inG ? 'plain' : ''}" data-act="join" data-id="${g.id}">${inG ? 'Leave group' : 'Join group'}</button></div>
    <div class="cols2"><div>
      ${panel('Shout', `<div class="pad row">${avatar(g.shout.u, 40)}<div><b>${ulink(g.shout.u)}</b> <span class="small muted">${g.shout.t}</span><div>${esc(g.shout.body)}</div></div></div>`)}
      ${panel('Events', ev ? `<div class="scroll"><table><tr><th>When</th><th>What</th><th>Where</th></tr>${ev}</table></div>` : '<div class="pad muted">No events scheduled.</div>')}
      ${panel('Wall', `<form class="pad form" data-form="wall" data-id="${g.id}"><label for="wall-body" class="small muted">${inG ? 'Post to the wall as ' + esc(ME) : 'Join the group to post on its wall.'}</label><input type="text" id="wall-body" maxlength="300" required ${inG ? '' : 'disabled'} placeholder="Say something to the group"><button class="btn" type="submit" ${inG ? '' : 'disabled'}>Post</button></form><div class="list">${wall.map(w => `<div class="row">${avatar(w.u, 32)}<div><b>${ulink(w.u)}</b> <span class="small muted">${w.t}</span><div class="body-text">${esc(w.body)}</div></div></div>`).join('') || '<div class="muted">The wall is empty.</div>'}</div>`)}
    </div><div>
      ${panel('Ranks', `<div class="pad">${g.ranks.map(r => `<div class="stat"><span>${esc(r[0])}</span><b class="num">${fmt(r[1])}</b></div>`).join('')}</div>`)}
      ${panel('Allies', `<div class="pad">${rel(g.allies, 'ally')}</div>`)}
      ${panel('Enemies', `<div class="pad">${rel(g.enemies, 'enemy')}</div>`)}
      ${panel('Members', `<div class="pad" style="display:flex;gap:6px;flex-wrap:wrap">${g.roster.map(u => `<a href="${u === ME ? '#profile' : '#user-' + u}" title="${esc(u)}">${avatar(u, 44)}</a>`).join('')}</div>`)}
    </div></div>`;
  };

  const itemCard = (it, extra) => `<a class="card" href="#item-${it.id}"><span class="art">${icon(it)}${it.limited ? `<span class="tag${it.stock <= 250 ? ' u' : ''}">LIMITED</span>` : ''}</span><span class="meta"><b>${esc(it.name)}</b>${extra || (it.limited ? `<span class="small muted">RAP</span>${bits(it.rap)}` : bits(it.price))}</span></a>`;

  V.catalog = () => {
    const tabs = ['All', 'Limiteds', 'Hats', 'Gear'];
    const list = D.items.filter(i => filter === 'All' || (filter === 'Limiteds' && i.limited) || (filter === 'Hats' && i.type === 'Hat') || (filter === 'Gear' && i.type === 'Gear'));
    return `<div class="head"><h1>Catalog</h1><span class="muted">Limiteds have a fixed stock and a serial number on every copy.</span></div>
    <div class="tabs">${tabs.map(t => `<button data-act="filter" data-v="${t}" class="${t === filter ? 'on' : ''}">${t}</button>`).join('')}</div>
    <div class="grid">${list.map(i => itemCard(i)).join('')}</div>`;
  };

  V.item = id => {
    const it = item(id); if (!it) return V.catalog();
    const mine = st.inv.filter(e => e[0] === it.id);
    let side;
    if (it.limited) {
      const rows = it.sellers.map((s, i) => st.sold[it.id + ':' + s[1]] ? '' : `<tr><td>${ulink(s[0])}</td><td class="c num">#${s[1]} of ${fmt(it.stock)}</td><td class="c">${bits(s[2])}</td><td class="c"><button class="btn" data-act="buy" data-id="${it.id}" data-i="${i}">Buy</button></td></tr>`).join('');
      side = panel('Sale history', `<div class="pad">${chart(it.hist)}<div class="stat"><span>Recent average price</span>${bits(it.rap)}</div><div class="stat"><span>Original stock</span><b class="num">${fmt(it.stock)} copies, sold out</b></div><div class="stat"><span>You own</span><b class="num">${mine.length ? mine.map(e => '#' + e[1]).join(', ') : 'None'}</b></div></div>`)
        + panel('Resellers', `<div class="scroll"><table><tr><th>Seller</th><th class="c">Serial</th><th class="c">Price</th><th></th></tr>${rows || '<tr><td colspan="4" class="muted">No copies for sale right now.</td></tr>'}</table></div>`);
    } else {
      side = panel('Buy', `<div class="pad form"><div>${bits(it.price)}</div><button class="btn play" data-act="buy" data-id="${it.id}" ${mine.length ? 'disabled' : ''}>${mine.length ? 'Owned' : 'Buy'}</button><span class="small muted">Not limited. Always in stock.</span></div>`);
    }
    return `<div class="crumbs"><a href="#catalog">Catalog</a> › ${esc(it.name)}</div>
    <div class="cols2" style="grid-template-columns:260px 1fr"><div class="panel"><div class="card" style="border:0"><span class="art">${icon(it)}${it.limited ? '<span class="tag">LIMITED</span>' : ''}</span></div></div>
    <div><div class="head"><h1>${esc(it.name)}</h1><span class="muted">${it.type}</span></div><p>${esc(it.desc)}</p>${side}</div></div>`;
  };

  V.trade = () => {
    const slots = (u, side) => invOf(u).map((e, k) => `<button class="slot${tr[side].includes(k) ? ' on' : ''}" data-act="pick" data-side="${side}" data-k="${k}">${icon(item(e[0]))}<span>${label(e)}</span><span class="num muted">${fmt(val(e))}</span></button>`).join('') || '<span class="muted">Nothing to trade.</span>';
    const sum = (u, side) => tr[side].reduce((a, k) => a + val(invOf(u)[k]), 0);
    const gv = sum(ME, 'give'), gt = sum(tr.partner, 'get'), tot = gv + gt || 1, diff = gt - gv;
    const verdict = !gv && !gt ? ['fair', 'Pick items on both sides'] : Math.abs(diff) <= 0.05 * Math.max(gv, gt) ? ['fair', 'Even trade'] : diff > 0 ? ['win', 'You gain ' + fmt(diff) + ' in value'] : ['lose', 'You lose ' + fmt(-diff) + ' in value'];
    const names = l => l.map(label).join(', ') || 'nothing';
    const hist = st.trades.concat(D.trades.map((t, i) => Object.assign({ i }, t, st.ts[i] ? { status: st.ts[i], dir: 'Completed' } : {})));
    const rows = hist.map(t => `<tr><td><b>${t.dir}</b><div class="small muted">${t.t}</div></td><td>${ulink(t.with)}</td><td>${names(t.give)}</td><td>${names(t.get)}</td><td>${t.status === 'Pending' && t.dir === 'Inbound' ? `<button class="btn" data-act="answer" data-i="${t.i}" data-v="Accepted">Accept</button> <button class="btn plain" data-act="answer" data-i="${t.i}" data-v="Declined">Decline</button>` : t.status}</td></tr>`).join('');
    return `<div class="head"><h1>Trade</h1><div class="row" style="align-items:center"><label for="partner">Trade with</label><select id="partner" data-act="partner" style="width:auto">${Object.keys(D.inventory).filter(u => u !== ME).map(u => `<option${u === tr.partner ? ' selected' : ''}>${u}</option>`).join('')}</select></div></div>
    <div class="trade">${panel('Your items: you give', `<div class="pad inv">${slots(ME, 'give')}</div>`)}${panel(esc(tr.partner) + "'s items: you get", `<div class="pad inv">${slots(tr.partner, 'get')}</div>`)}</div>
    <div class="panel pad"><div class="sum"><span>You give <b class="num">${fmt(gv)}</b> · You get <b class="num">${fmt(gt)}</b> <span class="muted small">(value by recent average price)</span></span><span class="verdict ${verdict[0]}">${verdict[1]}</span><button class="btn play" data-act="send" ${tr.give.length && tr.get.length ? '' : 'disabled'}>Send trade</button></div><div class="bar" title="Share of total value you receive"><i style="width:${(gt / tot * 100).toFixed(1)}%"></i></div></div>
    ${panel('Your trades', `<div class="scroll"><table><tr><th>Status</th><th>With</th><th>You give</th><th>You get</th><th></th></tr>${rows}</table></div>`)}`;
  };

  V.profile = u => {
    u = u && D.users[u] ? u : ME; const d = D.users[u], inv = invOf(u);
    const gs = D.groups.filter(g => (u === ME ? st.joined.includes(g.id) : g.roster.includes(u)));
    const worth = inv.reduce((a, e) => a + (item(e[0]).limited ? val(e) : 0), 0);
    return `<div class="cols2" style="grid-template-columns:240px 1fr"><div>
      ${panel(esc(u), `<div class="pad">${avatar(u, 200).replace('width="200" height="200"', 'style="width:100%;height:auto"')}<p style="margin-top:8px">${esc(d.blurb)}</p><div class="stat"><span>Joined</span><b>${d.joined}</b></div><div class="stat"><span>Forum posts</span><b class="num">${fmt(d.posts)}</b></div><div class="stat"><span>Limiteds value</span>${bits(worth)}</div><div class="stat"><span>Status</span><span><i class="dot${d.playing || u === ME ? '' : ' off'}"></i>${u === ME ? 'Online' : d.playing ? esc(d.playing) : 'Offline'}</span></div>${u !== ME && D.inventory[u] ? `<button class="btn" data-act="tradewith" data-u="${u}" style="margin-top:8px">Send trade</button>` : ''}</div>`)}
      ${panel('Groups', `<div class="list">${gs.map(g => `<div class="row">${emblem(g, 1)}<a href="#group-${g.id}">${esc(g.name)}</a></div>`).join('') || '<div class="muted">No groups.</div>'}</div>`)}
    </div><div>${panel('Inventory', `<div class="pad grid">${inv.map(e => itemCard(item(e[0]), item(e[0]).limited ? `<span class="small muted num">Serial #${e[1]}</span>` : '<span class="small muted">Standard item</span>')).join('') || '<span class="muted">Inventory is private or empty.</span>'}</div>`)}</div></div>`;
  };
  V.user = V.profile;

  /* ---------- router ---------- */
  const NAV = { thread: 'forum', group: 'groups', item: 'catalog', play: 'games' };
  function render() {
    if (window.KBGame) KBGame.stop();
    const h = (location.hash || '#home').slice(1), i = h.indexOf('-');
    const r = i < 0 ? h : h.slice(0, i), arg = i < 0 ? '' : h.slice(i + 1);
    const view = V[r] || V.home;
    main.innerHTML = view(arg);
    document.getElementById('bits').textContent = fmt(st.bits);
    document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.r === (NAV[r] || r)));
    render.route = r;
  }
  window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

  /* ---------- actions ---------- */
  const A = {
    filter: el => { filter = el.dataset.v; },
    join: el => { const id = el.dataset.id, k = st.joined.indexOf(id); if (k < 0) { st.joined.push(id); toast('You joined ' + group(id).name + ' as the lowest rank.'); } else { st.joined.splice(k, 1); toast('You left ' + group(id).name + '.'); } },
    buy: el => {
      const it = item(el.dataset.id);
      if (it.limited) {
        const s = it.sellers[+el.dataset.i];
        if (st.bits < s[2]) return toast('You need ' + fmt(s[2] - st.bits) + ' more Bits for that copy.');
        st.bits -= s[2]; st.inv.push([it.id, s[1]]); st.sold[it.id + ':' + s[1]] = 1; toast('Bought ' + it.name + ' #' + s[1] + ' from ' + s[0] + '.');
      } else {
        if (st.bits < it.price) return toast('You do not have enough Bits.');
        st.bits -= it.price; st.inv.push([it.id, 0]); toast('Bought ' + it.name + '.');
      }
      tr.give = [];
    },
    pick: el => { const l = tr[el.dataset.side], k = +el.dataset.k, at = l.indexOf(k); if (at < 0) l.push(k); else l.splice(at, 1); },
    send: () => {
      st.trades.unshift({ dir: 'Outbound', with: tr.partner, give: tr.give.map(k => st.inv[k]), get: tr.get.map(k => invOf(tr.partner)[k]), status: 'Pending', t: now() });
      toast('Trade sent to ' + tr.partner + '. In the prototype it stays pending.'); tr.give = []; tr.get = [];
    },
    answer: el => {
      const i = +el.dataset.i, t = D.trades[i]; st.ts[i] = el.dataset.v;
      if (el.dataset.v === 'Accepted') { t.give.forEach(g => { const k = st.inv.findIndex(e => e[0] === g[0] && e[1] === g[1]); if (k >= 0) st.inv.splice(k, 1); }); t.get.forEach(g => st.inv.push(g.slice())); tr.give = []; }
      toast('Trade with ' + t.with + ' ' + el.dataset.v.toLowerCase() + '.');
    },
    tradewith: el => { tr = { partner: el.dataset.u, give: [], get: [] }; location.hash = '#trade'; return true; }
  };
  main.addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el || el.tagName === 'SELECT' || el.disabled) return;
    const skip = A[el.dataset.act](el); save(); if (!skip) render();
  });
  main.addEventListener('change', e => { if (e.target.dataset.act === 'partner') { tr = { partner: e.target.value, give: [], get: [] }; render(); } });
  main.addEventListener('submit', e => {
    e.preventDefault(); const f = e.target, id = f.dataset.id, box = f.querySelector('textarea, input'), body = box.value.trim(); if (!body) return;
    if (f.dataset.form === 'reply') (st.replies[id] = st.replies[id] || []).push({ u: ME, t: now(), body });
    else (st.walls[id] = st.walls[id] || []).unshift({ u: ME, t: now(), body });
    save(); render(); toast('Posted.');
  });

  render();
})();
