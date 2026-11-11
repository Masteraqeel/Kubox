/* Kubox live mode. When the page is served by the Kubox server, accounts, forum, groups and profiles use the real API.
   When there is no API (GitHub Pages, a preview), boot() resolves without changing anything and the sample data stays. */
window.KBLive = {
  boot(app) {
    const { D, V, A, F, NAV, esc, fmt, avatar, emblem, panel, toast, ulink, render } = app;
    let me = null, reporting = null;

    async function api(method, path, body) {
      const res = await fetch('api' + path, { method, credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-kubox': '1' }, body: body === undefined ? undefined : JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ').');
      return data;
    }
    const get = p => api('GET', p);

    /* ---------- helpers ---------- */
    const col = c => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#888888');
    // Register a player so the shared avatar and link helpers can draw them.
    const seen = u => { if (u && u.username) D.users[u.username] = Object.assign(D.users[u.username] || {}, { c: (u.colors || []).map(col) }); return u; };
    const G = g => ({ id: g.slug, name: g.name, tag: g.tag, col: col(g.color), col2: col(g.color2) });
    const isMod = () => me && (me.role === 'mod' || me.role === 'admin');
    function when(iso) {
      const d = new Date(iso), n = new Date(), day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
      const t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), diff = Math.round((day(n) - day(d)) / 86400000);
      if (diff === 0) return 'Today, ' + t; if (diff === 1) return 'Yesterday, ' + t; if (diff === -1) return 'Tomorrow, ' + t;
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() === n.getFullYear() ? undefined : 'numeric' }) + ', ' + t;
    }
    const split = arg => { const m = /^(.*?)(?:-p(\d+))?$/.exec(arg || ''); return [m[1], +m[2] || 1]; };
    const pager = (base, page, pages) => pages < 2 ? '' : `<div class="pager">${Array.from({ length: pages }, (_, i) => i + 1 === page ? `<b>${i + 1}</b>` : `<a href="#${base}${i ? '-p' + (i + 1) : ''}">${i + 1}</a>`).join('')}</div>`;
    const go = hash => { if (location.hash === hash) render(); else location.hash = hash; return true; };
    const val = (f, name) => { const el = f.querySelector('[name="' + name + '"]'); return el ? (el.type === 'checkbox' ? el.checked : el.value) : ''; };
    const role = r => (r && r !== 'member' ? ` <span class="role">${esc(r)}</span>` : '');
    const loginHint = what => `<div class="pad muted"><a href="#login">Log in</a> or <a href="#register">sign up</a> to ${what}.</div>`;
    const reportForm = (kind, id) => reporting && reporting.kind === kind && reporting.id === id ? `<form class="form" data-form="report" style="margin-top:8px"><label>Why are you reporting this?<input name="reason" required minlength="3" maxlength="300"></label><div class="tools"><button class="btn sm warn" type="submit">Send report</button><button class="btn sm plain" type="button" data-act="report">Cancel</button></div></form>` : '';

    function account() {
      document.getElementById('strip').textContent = 'Live: accounts, the forum and groups are real. The catalog, trading and games still use sample data.';
      document.getElementById('acct').innerHTML = me
        ? `<span class="bits" title="Bits are sample data for now"><i class="coin"></i><b id="bits">0</b></span>${isMod() ? '<a href="#mod">Mod</a>' : ''}<a href="#profile">${esc(me.username)}</a><button class="btn sm" id="logout" type="button">Log out</button>`
        : `<b id="bits" hidden>0</b><a href="#login">Log in</a><a class="btn sm play" href="#register" style="font-size:11px">Sign up</a>`;
      const out = document.getElementById('logout');
      if (out) out.onclick = () => app.run(async () => { await api('POST', '/logout'); me = null; app.setMe('Guest'); account(); toast('Logged out.'); return go('#home'); });
    }
    function signedIn(u) { me = seen(u); app.setMe(u.username); account(); }

    /* ---------- views ---------- */
    function install() {
      Object.assign(NAV, { login: '', register: '', mod: '' });

      V.login = () => me ? V.home() : `<div class="narrow">${panel('Log in', `<form class="pad form" data-form="login"><label>Username or email<input name="login" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button class="btn play" type="submit">Log in</button><span class="small muted">No account? <a href="#register">Sign up with an invite code</a>.</span></form>`)}</div>`;

      V.register = () => me ? V.home() : `<div class="narrow">${panel('Sign up', `<form class="pad form" data-form="register"><label>Invite code<input name="invite" required maxlength="64" autocomplete="off"></label><label>Username (3 to 20 letters and digits)<input name="username" required minlength="3" maxlength="20" pattern="[A-Za-z0-9]+" autocomplete="username"></label><label>Email<input name="email" type="email" required autocomplete="email"></label><label>Password (8 characters or more)<input name="password" type="password" required minlength="8" autocomplete="new-password"></label><label class="check"><input type="checkbox" name="adult" required> I am 18 or older.</label><button class="btn play" type="submit">Create account</button><span class="small muted">Kubox is invite-only and for adults. Have an account? <a href="#login">Log in</a>.</span></form>`)}</div>`;

      V.home = async () => {
        const latest = (await get('/threads/latest')).threads;
        const list = `<div class="list">${latest.map(t => `<div><a href="#thread-${t.id}">${esc(t.title)}</a><div class="muted small">${esc(t.board)} · ${esc(t.last_user || '')} · ${when(t.last_post_at)}</div></div>`).join('') || '<div class="muted">No threads yet. Start the first one in the forum.</div>'}</div>`;
        if (!me) return `<div class="head"><h1>Welcome to Kubox</h1></div><div class="cols2"><div>${panel('What this is', `<div class="pad"><p class="body-text">A small platform for people who miss simple brick games, busy forums, clans that take themselves seriously, and hats with serial numbers.</p><p>Kubox is invite-only and for adults.</p><div class="tools"><a class="btn play" href="#register">Sign up</a><a class="btn" href="#login">Log in</a><a class="btn plain" href="#games">Try the brick demo</a></div></div>`)}${panel('Latest in the forum', list, '<a href="#forum">Forum</a>')}</div><div>${panel('Rules', '<div class="pad"><p>Adults only.</p><p>No real money trading.</p><p>Be decent in the forums.</p></div>')}</div></div>`;
        const [feed, prof] = await Promise.all([get('/feed'), get('/users/' + me.username)]);
        const shouts = feed.shouts.map(s => `<div class="row">${emblem(G(s.group), 1)}<div><a href="#group-${esc(s.group.slug)}"><b>${esc(s.group.name)}</b></a> <span class="muted small">${esc(s.by || '')} · ${when(s.at)}</span><div>${esc(s.body)}</div></div></div>`).join('');
        const ev = feed.events.map(e => `<div><b>${when(e.startsAt)}</b><div>${esc(e.title)}</div><div class="small muted"><a href="#group-${esc(e.group.slug)}">${esc(e.group.name)}</a>${e.place ? ' · ' + esc(e.place) : ''}</div></div>`).join('');
        return `<div class="head"><h1>Hello, ${esc(me.username)}</h1><a class="btn play" href="#games">Play</a></div><div class="cols">
          <div>${panel('You', `<div class="pad">${avatar(me.username, 176).replace('width="176" height="176"', 'style="width:100%;height:auto"')}<div class="stat"><span>Forum posts</span><b class="num">${fmt(prof.posts)}</b></div><div class="stat"><span>Groups</span><b class="num">${prof.groups.length}</b></div><div class="tools"><a class="btn sm plain" href="#profile">Edit profile and invites</a></div></div>`)}</div>
          <div>${panel('Group shouts', `<div class="list">${shouts || '<div class="muted">Join a group to see its shouts here.</div>'}</div>`, '<a href="#groups">All groups</a>')}${panel('Latest in the forum', list, '<a href="#forum">Forum</a>')}</div>
          <div>${panel('Your events', `<div class="list">${ev || '<div class="muted">Nothing scheduled.</div>'}</div>`)}</div></div>`;
      };

      V.forum = async arg => {
        const [id, page] = split(arg);
        if (!id) {
          const rows = (await get('/boards')).boards.map(b => `<tr><td><a href="#forum-${esc(b.id)}"><b>${esc(b.name)}</b></a><div class="small muted">${esc(b.description)}</div></td><td class="c num">${fmt(b.threads)}</td><td class="c num">${fmt(b.posts)}</td><td class="small">${b.latest ? `<a href="#thread-${b.latest.id}">${esc(b.latest.title)}</a>` : '<span class="muted">No threads yet</span>'}</td></tr>`).join('');
          return `<div class="head"><h1>Forum</h1><span class="muted">The front page of the community.</span></div><div class="panel scroll"><table><tr><th>Board</th><th class="c">Threads</th><th class="c">Posts</th><th>Latest thread</th></tr>${rows}</table></div>`;
        }
        const d = await get('/boards/' + encodeURIComponent(id) + '/threads?page=' + page);
        const rows = d.threads.map(t => { seen(t.author); return `<tr><td>${t.pinned ? '<span class="pin">PINNED</span>' : ''}${t.locked ? '<span class="pin">LOCKED</span>' : ''}<a href="#thread-${t.id}"><b>${esc(t.title)}</b></a><div class="small muted">by ${ulink(t.author.username)}</div></td><td class="c num">${fmt(t.replies)}</td><td class="c num">${fmt(t.views)}</td><td class="small">${t.lastUser ? ulink(t.lastUser) : ''}<div class="muted">${when(t.lastPost)}</div></td></tr>`; }).join('');
        return `<div class="crumbs"><a href="#forum">Forum</a> › ${esc(d.board.name)}</div><div class="head"><h1>${esc(d.board.name)}</h1></div>
          <div class="panel scroll"><table><tr><th>Thread</th><th class="c">Replies</th><th class="c">Views</th><th>Last post</th></tr>${rows || '<tr><td colspan="4" class="muted">No threads here yet. Be the first to post.</td></tr>'}</table></div>${pager('forum-' + d.board.id, d.page, d.pages)}
          ${panel('New thread', me ? `<form class="pad form" data-form="newthread" data-id="${esc(d.board.id)}"><label>Title<input name="title" required minlength="3" maxlength="120"></label><label>Post<textarea name="body" required maxlength="5000"></textarea></label><button class="btn" type="submit">Post thread</button></form>` : loginHint('start a thread'))}`;
      };

      V.thread = async arg => {
        const [id, page] = split(arg), d = await get('/threads/' + encodeURIComponent(id) + '?page=' + page), t = d.thread;
        const posts = d.posts.map(p => { const a = seen(p.author), own = me && a.username === me.username; return `<div class="post"><div class="who">${avatar(a.username, 64)}<div><b>${ulink(a.username)}</b>${role(a.role)}<div class="muted">Posts: ${fmt(a.posts)}</div><div class="muted">Joined: ${new Date(a.joined).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</div></div></div><div class="what"><div class="small muted">${when(p.created)}</div><div class="body-text">${esc(p.body)}</div>${me ? `<div class="tools">${own || isMod() ? `<button class="btn sm plain" data-act="delpost" data-id="${p.id}">Remove</button>` : ''}${own ? '' : `<button class="btn sm plain" data-act="report" data-kind="post" data-id="${p.id}">Report</button>`}</div>${reportForm('post', p.id)}` : ''}</div></div>`; }).join('');
        const mod = isMod() ? `<div class="tools"><button class="btn sm" data-act="modthread" data-id="${t.id}" data-k="pinned" data-v="${!t.pinned}">${t.pinned ? 'Unpin' : 'Pin'}</button><button class="btn sm" data-act="modthread" data-id="${t.id}" data-k="locked" data-v="${!t.locked}">${t.locked ? 'Unlock' : 'Lock'}</button></div>` : '';
        const reply = !me ? loginHint('reply') : t.locked && !isMod() ? '<div class="pad muted">This thread is locked.</div>' : `<form class="pad form" data-form="reply" data-id="${t.id}"><label for="reply-body">Posting as ${esc(me.username)}</label><textarea id="reply-body" name="body" required maxlength="5000" placeholder="Write your reply"></textarea><button class="btn" type="submit">Post reply</button></form>`;
        return `<div class="crumbs"><a href="#forum">Forum</a> › <a href="#forum-${esc(t.board_id)}">${esc(t.board)}</a></div><div class="head"><h1>${t.locked ? '<span class="pin">LOCKED</span>' : ''}${esc(t.title)}</h1>${mod}</div>${pager('thread-' + t.id, d.page, d.pages)}<div class="panel">${posts}</div>${pager('thread-' + t.id, d.page, d.pages)}${panel('Reply', reply)}`;
      };

      V.groups = async () => {
        const d = await get('/groups');
        const rows = d.groups.map(g => `<div class="row">${emblem(G(g))}<div style="flex:1"><a href="#group-${esc(g.slug)}"><b>${esc(g.name)}</b></a> ${d.mine.includes(g.slug) ? '<span class="pin">MEMBER</span>' : ''}<div>${esc(g.description)}</div><div class="small muted num">${fmt(g.members)} members · owned by ${esc(g.owner)} · <span class="ally">${g.allies} allies</span> · <span class="enemy">${g.enemies} enemies</span></div></div></div>`).join('');
        return `<div class="head"><h1>Groups</h1><span class="muted">Clans, guilds and councils. Ranks, allies, enemies and a wall.</span></div><div class="panel list">${rows || '<div class="muted">No groups yet. Found the first one below.</div>'}</div>
          ${panel('Start a group', me ? `<form class="pad form" data-form="newgroup"><div class="fields"><label>Name<input name="name" required minlength="3" maxlength="40"></label><label>Tag (2 to 4 letters)<input name="tag" required minlength="2" maxlength="4" pattern="[A-Za-z0-9]+"></label><label>Emblem colour<input type="color" name="color" value="#3a5f3a"></label><label>Text colour<input type="color" name="color2" value="#f5b800"></label></div><label>Description<input name="description" maxlength="500"></label><button class="btn" type="submit">Create group</button></form>` : loginHint('start a group'))}`;
      };

      V.group = async slug => {
        const g = await get('/groups/' + encodeURIComponent(slug)), E = G(g), lvl = g.me ? g.me.level : 0, officer = lvl >= 200, owner = lvl === 255;
        seen(g.owner); g.roster.forEach(seen); g.wall.forEach(w => seen(w.author)); if (g.shout) seen(g.shout.by);
        const sl = esc(g.slug);
        const rel = kind => g.relations.filter(r => r.kind === kind).map(r => { const o = G(r.group), pending = r.status === 'pending'; return `<div class="chip"><a href="#group-${esc(o.id)}" style="display:inline-flex;gap:6px;align-items:center">${emblem(o, 1)}<span class="${kind}">${esc(o.name)}</span></a>${pending ? '<span class="small muted">pending</span>' : ''}${owner && pending && r.incoming ? `<button class="btn sm" data-act="relaccept" data-g="${sl}" data-o="${esc(o.id)}">Accept</button>` : ''}${owner ? `<button class="btn sm plain" data-act="reldel" data-g="${sl}" data-o="${esc(o.id)}">Remove</button>` : ''}</div>`; }).join('') || '<span class="muted">None</span>';
        const ev = g.events.map(e => `<tr><td class="num"><b>${when(e.startsAt)}</b></td><td>${esc(e.title)}</td><td>${esc(e.place)}</td></tr>`).join('');
        const lower = g.ranks.filter(r => r.level < lvl);
        const roster = g.roster.map(m => `<tr><td><div class="row" style="align-items:center">${avatar(m.username, 28)}${ulink(m.username)}</div></td><td>${officer && m.level < lvl ? `<select data-change="setrank" data-g="${sl}" data-u="${esc(m.username)}" style="width:auto" aria-label="Rank for ${esc(m.username)}">${lower.map(r => `<option value="${r.id}"${r.level === m.level ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select> <button class="btn sm warn" data-act="kick" data-g="${sl}" data-u="${esc(m.username)}">Kick</button>` : esc(m.rank)}</td></tr>`).join('');
        return `<div class="crumbs"><a href="#groups">Groups</a> › ${esc(g.name)}</div>
          <div class="panel pad row">${emblem(E)}<div style="flex:1"><h1>${esc(g.name)}</h1><div class="muted small num">${fmt(g.members)} members · owned by ${ulink(g.owner.username)}${g.me ? ' · your rank: <b>' + esc(g.me.rank) + '</b>' : ''}</div><p style="margin-top:6px" class="body-text">${esc(g.description)}</p></div>
            ${!me ? '<a class="btn" href="#login">Log in to join</a>' : owner ? '' : `<button class="btn ${g.me ? 'plain' : ''}" data-act="join" data-id="${sl}" data-in="${g.me ? 1 : ''}">${g.me ? 'Leave group' : 'Join group'}</button>`}</div>
          <div class="cols2"><div>
            ${panel('Shout', (g.shout ? `<div class="pad row">${avatar(g.shout.by.username, 40)}<div><b>${ulink(g.shout.by.username)}</b> <span class="small muted">${when(g.shout.at)}</span><div>${esc(g.shout.body)}</div></div></div>` : '<div class="pad muted">No shout yet.</div>') + (officer ? `<form class="pad form" data-form="shout" data-id="${sl}"><label>New shout<input name="body" maxlength="300" required></label><button class="btn sm" type="submit">Shout</button></form>` : ''))}
            ${panel('Events', (ev ? `<div class="scroll"><table><tr><th>When</th><th>What</th><th>Where</th></tr>${ev}</table></div>` : '<div class="pad muted">No events scheduled.</div>') + (officer ? `<form class="pad form" data-form="event" data-id="${sl}"><div class="fields"><label>Title<input name="title" required minlength="3" maxlength="80"></label><label>Place<input name="place" maxlength="80"></label><label>Starts (your local time)<input name="startsAt" type="datetime-local" required></label></div><button class="btn sm" type="submit">Add event</button></form>` : ''))}
            ${panel('Wall', (g.me ? `<form class="pad form" data-form="wall" data-id="${sl}"><label for="wall-body">Post to the wall as ${esc(me.username)}</label><input id="wall-body" name="body" maxlength="300" required placeholder="Say something to the group"><button class="btn" type="submit">Post</button></form>` : '<div class="pad muted">Join the group to post on its wall.</div>') + `<div class="list">${g.wall.map(w => { const own = me && w.author.username === me.username; return `<div class="row">${avatar(w.author.username, 32)}<div style="flex:1"><b>${ulink(w.author.username)}</b> <span class="small muted">${when(w.created)}</span><div class="body-text">${esc(w.body)}</div>${me ? `<div class="tools">${own || officer || isMod() ? `<button class="btn sm plain" data-act="delwall" data-id="${w.id}">Remove</button>` : ''}${own ? '' : `<button class="btn sm plain" data-act="report" data-kind="wall" data-id="${w.id}">Report</button>`}</div>${reportForm('wall', w.id)}` : ''}</div></div>`; }).join('') || '<div class="muted">The wall is empty.</div>'}</div>`)}
            ${panel('Members', `<div class="scroll"><table><tr><th>Player</th><th>Rank</th></tr>${roster}</table></div>`)}
          </div><div>
            ${panel('Ranks', `<div class="pad">${g.ranks.map(r => `<div class="stat"><span>${esc(r.name)} <span class="muted small">(${r.level})</span></span><b class="num">${fmt(r.members)}</b></div>`).join('')}</div>` + (owner ? `<form class="pad form" data-form="newrank" data-id="${sl}"><div class="fields"><label>Rank name<input name="name" required minlength="2" maxlength="30"></label><label>Level (2 to 254)<input name="level" type="number" min="2" max="254" required></label></div><button class="btn sm" type="submit">Add rank</button></form>` : ''))}
            ${panel('Allies', `<div class="pad">${rel('ally')}</div>`)}
            ${panel('Enemies', `<div class="pad">${rel('enemy')}</div>`)}
            ${owner ? panel('Diplomacy', `<form class="pad form" data-form="relation" data-id="${sl}"><label>Other group's link name (the part after #group-)<input name="other" required maxlength="40"></label><label>Relation<select name="kind"><option value="ally">Request alliance</option><option value="enemy">Declare enemy</option></select></label><button class="btn sm" type="submit">Send</button></form>`) : ''}
          </div></div>`;
      };

      V.profile = V.user = async name => {
        if (!name && !me) return V.login();
        const p = seen(await get('/users/' + encodeURIComponent(name || me.username))), own = me && p.username === me.username;
        const groups = p.groups.map(g => `<div class="row">${emblem(G(g), 1)}<div><a href="#group-${esc(g.slug)}">${esc(g.name)}</a><div class="small muted">${esc(g.rank)}</div></div></div>`).join('');
        let side = '';
        if (own) {
          const inv = await get('/invites');
          side = panel('Edit profile', `<form class="pad form" data-form="profile"><label>About you<textarea name="blurb" maxlength="300">${esc(p.blurb)}</textarea></label><div class="fields"><label>Head<input type="color" name="c0" value="${col(p.colors[0])}"></label><label>Body<input type="color" name="c1" value="${col(p.colors[1])}"></label><label>Feet<input type="color" name="c2" value="${col(p.colors[2])}"></label></div><button class="btn" type="submit">Save</button></form>`)
            + panel('Your invites', `<div class="pad"><p class="muted">${inv.limit ? 'You can create ' + inv.limit + ' single-use invite codes. Give them to people you want here.' : 'As an admin you can create as many codes as you need.'}</p>${inv.invites.map(i => `<div class="stat"><code>${esc(i.code)}</code><span class="num">${i.uses} of ${i.max_uses} used</span></div>`).join('') || '<p class="muted">No codes yet.</p>'}<form class="tools" data-form="invite">${inv.limit ? '' : '<label class="check">Uses <input name="maxUses" type="number" min="1" max="1000" value="1" style="width:80px"></label>'}<button class="btn sm" type="submit" ${inv.limit && inv.invites.length >= inv.limit ? 'disabled' : ''}>Create invite code</button></form></div>`);
        } else if (isMod() && p.role !== 'admin') side = panel('Moderation', `<div class="pad tools"><button class="btn sm warn" data-act="ban" data-u="${esc(p.username)}" data-v="${p.banned ? '' : 1}">${p.banned ? 'Lift ban' : 'Ban account'}</button></div>`);
        return `<div class="cols2" style="grid-template-columns:240px 1fr"><div>${panel(esc(p.username) + role(p.role), `<div class="pad">${avatar(p.username, 200).replace('width="200" height="200"', 'style="width:100%;height:auto"')}<p style="margin-top:8px" class="body-text">${esc(p.blurb) || '<span class="muted">No description yet.</span>'}</p>${p.banned ? '<p class="enemy">This account is banned.</p>' : ''}<div class="stat"><span>Joined</span><b>${new Date(p.joined).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</b></div><div class="stat"><span>Forum posts</span><b class="num">${fmt(p.posts)}</b></div></div>`)}</div>
          <div>${panel('Groups', `<div class="list">${groups || '<div class="muted">Not in any groups yet.</div>'}</div>`)}${side}</div></div>`;
      };

      V.mod = async () => {
        if (!isMod()) return V.home();
        const rows = (await get('/mod/reports')).reports.map(r => `<tr><td><b>${esc(r.author || 'removed')}</b> wrote:<div class="body-text">${esc(r.body || '(already removed)')}</div><div class="small muted">${r.kind === 'post' ? `<a href="#thread-${r.thread_id}">Open thread</a>` : `<a href="#group-${esc(r.group_slug || '')}">Open group wall</a>`}</div></td><td>${esc(r.reason)}<div class="small muted">by ${esc(r.reporter)} · ${when(r.created_at)}</div></td><td><div class="tools"><button class="btn sm warn" data-act="resolve" data-id="${r.id}" data-v="1">Remove content</button><button class="btn sm plain" data-act="resolve" data-id="${r.id}" data-v="">Dismiss</button></div></td></tr>`).join('');
        return `<div class="head"><h1>Moderation</h1><span class="muted">Open reports, oldest first.</span></div><div class="panel scroll"><table><tr><th>Content</th><th>Report</th><th>Action</th></tr>${rows || '<tr><td colspan="3" class="muted">No open reports.</td></tr>'}</table></div>`;
      };

      /* ---------- forms ---------- */
      Object.assign(F, {
        login: async f => { signedIn((await api('POST', '/login', { login: val(f, 'login'), password: val(f, 'password') })).user); toast('Welcome back, ' + me.username + '.'); return go('#home'); },
        register: async f => { await api('POST', '/register', { invite: val(f, 'invite'), username: val(f, 'username'), email: val(f, 'email'), password: val(f, 'password'), adult: val(f, 'adult') }); signedIn((await get('/me')).user); toast('Account created. Welcome to Kubox.'); return go('#home'); },
        newthread: async f => go('#thread-' + (await api('POST', '/boards/' + f.dataset.id + '/threads', { title: val(f, 'title'), body: val(f, 'body') })).id),
        reply: async f => { const r = await api('POST', '/threads/' + f.dataset.id + '/posts', { body: val(f, 'body') }); toast('Posted.'); return go('#thread-' + f.dataset.id + (r.page > 1 ? '-p' + r.page : '')); },
        wall: async f => { await api('POST', '/groups/' + f.dataset.id + '/wall', { body: val(f, 'body') }); toast('Posted.'); },
        shout: async f => { await api('POST', '/groups/' + f.dataset.id + '/shout', { body: val(f, 'body') }); toast('Shout updated.'); },
        event: async f => { await api('POST', '/groups/' + f.dataset.id + '/events', { title: val(f, 'title'), place: val(f, 'place'), startsAt: new Date(val(f, 'startsAt')).toISOString() }); toast('Event added.'); },
        newrank: async f => { await api('POST', '/groups/' + f.dataset.id + '/ranks', { name: val(f, 'name'), level: +val(f, 'level') }); toast('Rank added.'); },
        relation: async f => { const r = await api('POST', '/groups/' + f.dataset.id + '/relations', { other: val(f, 'other').trim().toLowerCase(), kind: val(f, 'kind') }); toast(r.status === 'pending' ? 'Alliance request sent. Their owner has to accept it.' : 'Enemy declared.'); },
        newgroup: async f => go('#group-' + (await api('POST', '/groups', { name: val(f, 'name'), tag: val(f, 'tag'), description: val(f, 'description'), color: val(f, 'color'), color2: val(f, 'color2') })).slug),
        profile: async f => { await api('PATCH', '/me', { blurb: val(f, 'blurb'), colors: [val(f, 'c0'), val(f, 'c1'), val(f, 'c2')] }); toast('Profile saved.'); },
        invite: async f => { const r = await api('POST', '/invites', { maxUses: +val(f, 'maxUses') || 1 }); toast('Invite code created: ' + r.code); },
        report: async f => { await api('POST', '/reports', { kind: reporting.kind, targetId: reporting.id, reason: val(f, 'reason') }); reporting = null; toast('Report sent to the moderators.'); }
      });

      /* ---------- actions ---------- */
      Object.assign(A, {
        join: async el => { await api('POST', '/groups/' + el.dataset.id + (el.dataset.in ? '/leave' : '/join')); toast(el.dataset.in ? 'You left the group.' : 'You joined as the lowest rank.'); },
        delpost: async el => { await api('DELETE', '/posts/' + el.dataset.id); toast('Post removed.'); },
        delwall: async el => { await api('DELETE', '/wall/' + el.dataset.id); toast('Wall post removed.'); },
        report: el => { const id = +el.dataset.id; reporting = id && !(reporting && reporting.id === id && reporting.kind === el.dataset.kind) ? { kind: el.dataset.kind, id } : null; },
        modthread: async el => { await api('PATCH', '/threads/' + el.dataset.id, { [el.dataset.k]: el.dataset.v === 'true' }); },
        setrank: async el => { await api('POST', '/groups/' + el.dataset.g + '/members/' + el.dataset.u + '/rank', { rankId: +el.value }); toast('Rank changed.'); },
        kick: async el => { await api('DELETE', '/groups/' + el.dataset.g + '/members/' + el.dataset.u); toast(el.dataset.u + ' was removed from the group.'); },
        relaccept: async el => { await api('POST', '/groups/' + el.dataset.g + '/relations/' + el.dataset.o + '/accept'); toast('Alliance accepted.'); },
        reldel: async el => { await api('DELETE', '/groups/' + el.dataset.g + '/relations/' + el.dataset.o); toast('Relation removed.'); },
        ban: async el => { await api('POST', '/mod/users/' + el.dataset.u + '/ban', { banned: !!el.dataset.v }); toast(el.dataset.v ? 'Account banned.' : 'Ban lifted.'); },
        resolve: async el => { await api('POST', '/mod/reports/' + el.dataset.id + '/resolve', { remove: !!el.dataset.v }); toast(el.dataset.v ? 'Content removed.' : 'Report dismissed.'); }
      });
    }

    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 4000);
    return fetch('api/me', { credentials: 'same-origin', signal: ctl.signal })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { clearTimeout(timer); if (!d || d.kubox !== true) return; install(); if (d.user) signedIn(d.user); else { app.setMe('Guest'); account(); } })
      .catch(() => { clearTimeout(timer); });
  }
};
