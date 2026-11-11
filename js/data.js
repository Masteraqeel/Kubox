/* Kubox prototype: mock data. Everything here is placeholder content. */
window.KB = {
  me: 'Founder',
  bits: 12450,
  users: {
    Founder:     { c: ['#f5b800', '#2b6fd9', '#1d2b4f'], joined: 'Nov 2026', posts: 214, blurb: 'Building the place we all miss.', playing: null },
    brickwarden: { c: ['#f2f2ee', '#d9342b', '#3a3f4b'], joined: 'Nov 2026', posts: 1893, blurb: 'Forum regular. I answer scripting questions when I should be sleeping.', playing: 'Build Sandbox' },
    SgtHalden:   { c: ['#c9a27a', '#3a5f3a', '#22301f'], joined: 'Nov 2026', posts: 742, blurb: 'Iron Legion, 2nd Battalion. Trainings every day at 20:00 UTC.', playing: 'Training Facility' },
    novaquill:   { c: ['#8a4fd1', '#f2f2ee', '#8a4fd1'], joined: 'Nov 2026', posts: 388, blurb: 'Trader. I do not answer "what is this worth" in messages. Post in the forum.', playing: null },
    TinCanTom:   { c: ['#9aa3ad', '#e07b1a', '#3a3f4b'], joined: 'Dec 2026', posts: 96, blurb: 'I make obstacle courses that are too hard.', playing: 'Sword Fight Arena' },
    ohmlette:    { c: ['#f5d76e', '#2fa84f', '#1c6b33'], joined: 'Dec 2026', posts: 521, blurb: 'Skyline Builders Guild. Ask me about hinges.', playing: 'Build Sandbox' },
    Vexley:      { c: ['#3a3f4b', '#111522', '#d9342b'], joined: 'Nov 2026', posts: 1104, blurb: 'Vanta Corps high command. We raid on weekends.', playing: 'Sword Fight Arena' },
    GeneralRuk:  { c: ['#c9a27a', '#1d2b4f', '#f5b800'], joined: 'Nov 2026', posts: 2650, blurb: 'Founder of Iron Legion. Discipline first.', playing: 'Training Facility' },
    quartzmoth:  { c: ['#7fe3ff', '#f2f2ee', '#2b6fd9'], joined: 'Jan 2027', posts: 57, blurb: 'New here. Collecting every hat with a brim.', playing: null }
  },
  friends: ['SgtHalden', 'ohmlette', 'TinCanTom', 'novaquill', 'brickwarden'],

  games: [
    { id: 'sandbox',  name: 'Build Sandbox',     by: 'Kubox',      playing: 312, visits: '48.2K', likes: 91, sky: '#8ec7f0', blocks: ['#d9342b', '#f5b800', '#2b6fd9'],
      desc: 'An open baseplate and a box of bricks. Build anything. Your build saves in this browser.' },
    { id: 'training', name: 'Training Facility', by: 'Iron Legion', playing: 188, visits: '31.7K', likes: 88, sky: '#a9c9e8', blocks: ['#3a3f4b', '#f5b800', '#3a5f3a'],
      desc: 'Line up on the pads, face the podium, then run the obstacle course. Recruits are standing by.' },
    { id: 'arena',    name: 'Sword Fight Arena', by: 'Kubox',      playing: 427, visits: '77.9K', likes: 94, sky: '#f0b98e', blocks: ['#3a3f4b', '#d9342b', '#2b6fd9'],
      desc: 'A platform over the void. Knock the others off before they wander off by themselves.' }
  ],

  cats: [
    { id: 'general',   name: 'General Discussion', desc: 'Anything about Kubox that does not fit elsewhere.', threads: 4812, posts: 61204 },
    { id: 'clans',     name: 'Clans & Guilds',     desc: 'Recruitment, declarations of war, alliances, raid reports.', threads: 2977, posts: 48113 },
    { id: 'deals',     name: "Let's Make a Deal",  desc: 'Trading limiteds. Post what you have and what you want.', threads: 3340, posts: 39870 },
    { id: 'scripting', name: 'Scripting Helpers',  desc: 'Luau questions and answers. Post your code and the error.', threads: 1422, posts: 11690 },
    { id: 'ideas',     name: 'Suggestions',        desc: 'Tell the team what to build next. Staff read this board.', threads: 906, posts: 8455 },
    { id: 'offtopic',  name: 'Off Topic',          desc: 'Everything else. Keep it civil.', threads: 7730, posts: 143002 }
  ],

  threads: [
    { id: 101, cat: 'clans', pinned: true, title: '[IL] Iron Legion is recruiting: trainings daily at 20:00 UTC', views: 9412, posts: [
      { u: 'GeneralRuk', t: 'Yesterday, 6:02 PM', body: 'Iron Legion is opening enlistment for the winter campaign.\n\nRequirements: join the group, attend one training at the Training Facility, and pass the obstacle course in under 90 seconds. Rank up through attendance and raid wins. No rank selling, ever.' },
      { u: 'SgtHalden', t: 'Yesterday, 6:40 PM', body: 'I host the 20:00 UTC session. Line up on the yellow pads, stay quiet until addressed, and face the podium. If you jump on the podium you are doing laps.' },
      { u: 'quartzmoth', t: 'Today, 9:15 AM', body: 'Attended last night. Fell off the course four times and still got promoted to Private. 10/10.' }
    ] },
    { id: 102, cat: 'clans', title: 'Vanta Corps declares war on Iron Legion', views: 6120, posts: [
      { u: 'Vexley', t: 'Today, 11:48 AM', body: 'Effective immediately. First raid on the IL fort is Saturday 19:00 UTC. Best of three, 20 minute rounds, flag capture. Bring your whole roster, you will need it.' },
      { u: 'GeneralRuk', t: 'Today, 12:03 PM', body: 'Accepted. Screenshots of the final scoreboard go in this thread. Losers post the surrender terms publicly.' },
      { u: 'TinCanTom', t: 'Today, 12:30 PM', body: 'Neutral party here. I will sell snacks from the sidelines.' }
    ] },
    { id: 103, cat: 'clans', title: 'Raid report: Frost Raiders 3, Skyline Guild 1', views: 1844, posts: [
      { u: 'ohmlette', t: 'Yesterday, 10:22 PM', body: 'We are builders. We built a very nice wall. They walked around it.' },
      { u: 'brickwarden', t: 'Yesterday, 10:41 PM', body: 'The wall was excellent, for the record.' }
    ] },
    { id: 201, cat: 'deals', pinned: true, title: 'Read before posting: how limiteds and serials work', views: 15230, posts: [
      { u: 'novaquill', t: 'Nov 20, 4:00 PM', body: 'Limiteds have a fixed stock. Once the stock sells out, the only way to get one is from another player.\n\nEvery copy has a serial number. Low serials carry a premium. RAP means recent average price: the rolling average of what copies actually sold for. RAP is a guide. It is easy to manipulate on low volume items, so check the sales chart before you accept a trade.' },
      { u: 'brickwarden', t: 'Nov 20, 4:31 PM', body: 'Adding: Bits cannot be cashed out. If someone offers real money for your items, report the message.' }
    ] },
    { id: 202, cat: 'deals', title: 'Trading Gilded Top Hat #112 for Crown of Studs + adds', views: 933, posts: [
      { u: 'Founder', t: 'Today, 1:10 PM', body: 'Serial 112 of 500. Looking for a Crown of Studs with a serial under 100, and I will add on my side if the serial is good.' },
      { u: 'novaquill', t: 'Today, 1:26 PM', body: 'I have Crown #61. Send a trade and include the Baseplate Banner.' }
    ] },
    { id: 203, cat: 'deals', title: 'Is Ember Horns projected?', views: 2710, posts: [
      { u: 'quartzmoth', t: 'Today, 8:02 AM', body: 'RAP jumped 40% in two days. Is that real demand or two people selling it back and forth?' },
      { u: 'novaquill', t: 'Today, 8:20 AM', body: 'Look at the chart on the item page. Three sales moved it. Treat the old RAP as the real value until volume backs it up.' }
    ] },
    { id: 301, cat: 'scripting', title: 'How do I weld two bricks so they move together?', views: 1502, posts: [
      { u: 'TinCanTom', t: 'Yesterday, 3:15 PM', body: 'My moving platform leaves its railing behind. What am I missing?' },
      { u: 'brickwarden', t: 'Yesterday, 3:29 PM', body: 'Create a Weld, set Part0 to the platform and Part1 to the railing, and parent it to the platform. Unanchor the railing or the weld cannot move it.' },
      { u: 'ohmlette', t: 'Yesterday, 4:02 PM', body: 'Or use a hinge and let it swing. Everything is better with hinges.' }
    ] },
    { id: 401, cat: 'general', pinned: true, title: 'Welcome to Kubox: what this place is', views: 22841, posts: [
      { u: 'Founder', t: 'Nov 11, 3:32 PM', body: 'Kubox is a small platform for people who miss simple brick games, busy forums, clans that take themselves seriously, and hats with serial numbers.\n\nThe rules are short: adults only, no real money trading, and be decent in the forums.' },
      { u: 'GeneralRuk', t: 'Nov 11, 3:50 PM', body: 'First. Iron Legion claims the north side of the baseplate.' }
    ] },
    { id: 402, cat: 'general', title: 'Post your oldest screenshot of a brick game', views: 3377, posts: [
      { u: 'ohmlette', t: 'Today, 10:05 AM', body: 'Mine is a tower that falls over the moment the server starts. I was very proud of it.' }
    ] },
    { id: 501, cat: 'ideas', title: 'Personal build servers that friends can join', views: 1210, posts: [
      { u: 'ohmlette', t: 'Yesterday, 7:45 PM', body: 'Let group owners host their own base server so the fort is always up, even between raids.' },
      { u: 'Founder', t: 'Yesterday, 8:10 PM', body: 'On the list. Self-hosted group servers are planned for the editor release.' }
    ] },
    { id: 601, cat: 'offtopic', title: 'Count to 10,000 before a mod posts', views: 48211, posts: [
      { u: 'TinCanTom', t: 'Today, 2:01 PM', body: '4,417' },
      { u: 'quartzmoth', t: 'Today, 2:02 PM', body: '4,418' }
    ] }
  ],

  groups: [
    { id: 'ironlegion', name: 'Iron Legion', tag: 'IL', col: '#3a5f3a', col2: '#f5b800', owner: 'GeneralRuk', members: 4812,
      desc: 'A disciplined military group. Daily trainings, weekend raids, promotions earned through attendance and wins.',
      shout: { u: 'SgtHalden', t: 'Today, 1:55 PM', body: 'Training at 20:00 UTC in the Training Facility. Uniforms on. Raid briefing after.' },
      ranks: [['Commander', 1], ['General', 4], ['Officer', 38], ['Sergeant', 212], ['Private', 1930], ['Recruit', 2627]],
      roster: ['GeneralRuk', 'SgtHalden', 'Founder', 'quartzmoth'], allies: ['skyline', 'tradecouncil'], enemies: ['vanta', 'frost'],
      events: [['Today 20:00 UTC', 'Training', 'Training Facility'], ['Sat 19:00 UTC', 'Raid defence vs Vanta Corps', 'Sword Fight Arena'], ['Sun 18:00 UTC', 'Officer tryouts', 'Training Facility']],
      wall: [{ u: 'quartzmoth', t: 'Today, 9:20 AM', body: 'Reporting for duty.' }, { u: 'SgtHalden', t: 'Today, 8:00 AM', body: 'Attendance from last night is logged. 14 promotions.' }] },
    { id: 'vanta', name: 'Vanta Corps', tag: 'VC', col: '#111522', col2: '#d9342b', owner: 'Vexley', members: 3975,
      desc: 'Raiders. We do not hold trainings, we hold forts that used to belong to other groups.',
      shout: { u: 'Vexley', t: 'Today, 11:50 AM', body: 'War declared on Iron Legion. Saturday 19:00 UTC. Be there.' },
      ranks: [['Overseer', 1], ['Warlord', 6], ['Raider', 890], ['Initiate', 3078]],
      roster: ['Vexley', 'TinCanTom'], allies: ['frost'], enemies: ['ironlegion', 'skyline'],
      events: [['Sat 19:00 UTC', 'Raid on Iron Legion', 'Sword Fight Arena']],
      wall: [{ u: 'TinCanTom', t: 'Today, 12:40 PM', body: 'Do raiders get dental?' }] },
    { id: 'skyline', name: 'Skyline Builders Guild', tag: 'SBG', col: '#2b6fd9', col2: '#f2f2ee', owner: 'ohmlette', members: 2140,
      desc: 'We build forts, courses and showcases for other groups. Commissions open.',
      shout: { u: 'ohmlette', t: 'Yesterday, 9:00 PM', body: 'Build night Friday in the Sandbox. Theme: bridges.' },
      ranks: [['Architect', 1], ['Master Builder', 12], ['Builder', 640], ['Apprentice', 1487]],
      roster: ['ohmlette', 'brickwarden'], allies: ['ironlegion', 'tradecouncil'], enemies: ['vanta'],
      events: [['Fri 21:00 UTC', 'Build night: bridges', 'Build Sandbox']],
      wall: [{ u: 'brickwarden', t: 'Yesterday, 9:30 PM', body: 'Bringing hinges.' }] },
    { id: 'tradecouncil', name: 'The Trade Council', tag: 'TTC', col: '#8a4fd1', col2: '#f5b800', owner: 'novaquill', members: 1688,
      desc: 'Value lists, middleman volunteers and a public record of confirmed scammers.',
      shout: { u: 'novaquill', t: 'Today, 8:30 AM', body: 'Value list updated. Ember Horns flagged as volatile.' },
      ranks: [['Chair', 1], ['Appraiser', 9], ['Trader', 1678]],
      roster: ['novaquill', 'Founder'], allies: ['ironlegion', 'skyline'], enemies: [],
      events: [['Wed 17:00 UTC', 'Value list review', 'Forum']],
      wall: [{ u: 'quartzmoth', t: 'Today, 8:45 AM', body: 'Thank you for the Ember Horns warning.' }] },
    { id: 'frost', name: 'Frost Raiders', tag: 'FR', col: '#7fe3ff', col2: '#1d2b4f', owner: 'TinCanTom', members: 911,
      desc: 'Small, fast, and currently 3 and 1 against the builders.',
      shout: { u: 'TinCanTom', t: 'Yesterday, 10:50 PM', body: 'GG Skyline. Nice wall.' },
      ranks: [['Jarl', 1], ['Raider', 910]],
      roster: ['TinCanTom'], allies: ['vanta'], enemies: ['ironlegion'],
      events: [],
      wall: [] }
  ],
  myGroups: ['ironlegion', 'tradecouncil'],

  items: [
    { id: 1, name: 'Gilded Top Hat', type: 'Hat', shape: 'tophat', col: '#f5b800', limited: true, stock: 500, rap: 4200, hist: [1500, 1650, 1900, 2400, 2300, 2900, 3300, 3100, 3600, 3900, 4050, 4200],
      desc: 'Released in the first week. 500 copies, each numbered.', sellers: [['novaquill', 61, 6800], ['brickwarden', 233, 4350], ['Vexley', 410, 4500]] },
    { id: 2, name: 'Visor of the First Wave', type: 'Hat', shape: 'visor', col: '#7fe3ff', limited: true, stock: 1000, rap: 1850, hist: [900, 950, 1100, 1050, 1200, 1400, 1380, 1500, 1640, 1700, 1790, 1850],
      desc: 'Given to the first thousand accounts that bought it. Never restocked.', sellers: [['TinCanTom', 877, 1900], ['ohmlette', 402, 2050]] },
    { id: 3, name: 'Crown of Studs', type: 'Hat', shape: 'crown', col: '#e07b1a', limited: true, stock: 250, rap: 9100, hist: [5000, 5200, 5600, 6100, 6000, 6900, 7400, 7300, 8000, 8500, 8900, 9100],
      desc: 'Four studs on a band. The rarest hat on the platform so far.', sellers: [['novaquill', 61, 14500], ['GeneralRuk', 198, 9600]] },
    { id: 4, name: 'Ember Horns', type: 'Hat', shape: 'horns', col: '#d9342b', limited: true, stock: 750, rap: 2600, hist: [1700, 1720, 1680, 1750, 1800, 1790, 1820, 1850, 1840, 1900, 2450, 2600],
      desc: 'Warm to the touch. Flagged as volatile by The Trade Council.', sellers: [['Vexley', 13, 5200], ['quartzmoth', 644, 2700]] },
    { id: 5, name: 'Baseplate Banner', type: 'Gear', shape: 'banner', col: '#2fa84f', limited: true, stock: 2000, rap: 640, hist: [300, 320, 360, 400, 390, 450, 500, 520, 560, 600, 620, 640],
      desc: 'Plant it and claim your corner of the map.', sellers: [['SgtHalden', 1502, 660], ['ohmlette', 88, 1200]] },
    { id: 6, name: "Founder's Blade", type: 'Gear', shape: 'blade', col: '#cfd6e0', limited: true, stock: 100, rap: 21500, hist: [12000, 12500, 13800, 15000, 14800, 16500, 17900, 18200, 19500, 20400, 21000, 21500],
      desc: 'One hundred copies. Most of them are never traded.', sellers: [['GeneralRuk', 7, 48000]] },
    { id: 7, name: 'Plain Cap', type: 'Hat', shape: 'cap', col: '#2b6fd9', price: 25, desc: 'A cap. It does what caps do.' },
    { id: 8, name: 'Traffic Cone', type: 'Hat', shape: 'cone', col: '#e07b1a', price: 60, desc: 'Found near the obstacle course.' },
    { id: 9, name: 'Wooden Sword', type: 'Gear', shape: 'sword', col: '#b98a4e', price: 120, desc: 'Standard issue for the arena.' },
    { id: 10, name: 'Tinted Shades', type: 'Hat', shape: 'shades', col: '#3a3f4b', price: 80, desc: 'For traders who do not want to be read.' }
  ],
  inventory: {
    Founder:    [[1, 112], [5, 940], [2, 318], [7, 0], [9, 0]],
    novaquill:  [[3, 61], [1, 61], [4, 205], [10, 0]],
    Vexley:     [[4, 13], [1, 410], [9, 0]],
    GeneralRuk: [[6, 7], [3, 198], [5, 3]],
    ohmlette:   [[2, 402], [5, 88], [8, 0]],
    TinCanTom:  [[2, 877], [8, 0], [9, 0]]
  },
  trades: [
    { dir: 'Inbound', with: 'Vexley', give: [[5, 940]], get: [[9, 0]], status: 'Pending', t: 'Today, 12:15 PM' },
    { dir: 'Completed', with: 'ohmlette', give: [[8, 0]], get: [[2, 318]], status: 'Accepted', t: 'Nov 30' }
  ]
};
