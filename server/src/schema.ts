import type { DB } from './db.ts';

const SCHEMA = `
create table if not exists users (
  id serial primary key,
  username text not null,
  username_lower text not null unique,
  email text not null unique,
  pw_hash text not null,
  role text not null default 'member',
  blurb text not null default '',
  colors text not null default '#f5b800,#2b6fd9,#1d2b4f',
  banned boolean not null default false,
  invite_code text,
  adult_confirmed_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table if not exists sessions (
  token_hash text primary key,
  user_id int not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table if not exists invites (
  code text primary key,
  created_by int references users(id),
  max_uses int not null default 1,
  uses int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists boards (
  id text primary key,
  name text not null,
  description text not null,
  position int not null
);
create table if not exists threads (
  id serial primary key,
  board_id text not null references boards(id),
  author_id int not null references users(id),
  title text not null,
  pinned boolean not null default false,
  locked boolean not null default false,
  deleted boolean not null default false,
  views int not null default 0,
  created_at timestamptz not null default now(),
  last_post_at timestamptz not null default now()
);
create index if not exists threads_board on threads (board_id, pinned desc, last_post_at desc);
create table if not exists posts (
  id serial primary key,
  thread_id int not null references threads(id),
  author_id int not null references users(id),
  body text not null,
  deleted boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists posts_thread on posts (thread_id, id);
create index if not exists posts_author on posts (author_id);
create table if not exists kgroups (
  id serial primary key,
  slug text not null unique,
  name text not null,
  tag text not null,
  description text not null default '',
  color text not null,
  color2 text not null,
  owner_id int not null references users(id),
  shout text not null default '',
  shout_by int references users(id),
  shout_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists group_ranks (
  id serial primary key,
  group_id int not null references kgroups(id) on delete cascade,
  name text not null,
  level int not null,
  unique (group_id, level)
);
create table if not exists group_members (
  group_id int not null references kgroups(id) on delete cascade,
  user_id int not null references users(id) on delete cascade,
  rank_id int not null references group_ranks(id),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user on group_members (user_id);
create table if not exists group_wall (
  id serial primary key,
  group_id int not null references kgroups(id) on delete cascade,
  author_id int not null references users(id),
  body text not null,
  deleted boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists group_wall_group on group_wall (group_id, id desc);
create table if not exists group_relations (
  group_id int not null references kgroups(id) on delete cascade,
  other_id int not null references kgroups(id) on delete cascade,
  kind text not null,
  status text not null,
  created_at timestamptz not null default now(),
  primary key (group_id, other_id)
);
create table if not exists group_events (
  id serial primary key,
  group_id int not null references kgroups(id) on delete cascade,
  title text not null,
  place text not null default '',
  starts_at timestamptz not null,
  created_by int not null references users(id)
);
create table if not exists place_state (
  place text primary key,
  bricks text not null,
  updated_at timestamptz not null default now()
);
create table if not exists reports (
  id serial primary key,
  reporter_id int not null references users(id),
  kind text not null,
  target_id int not null,
  reason text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
`;

const BOARDS: [string, string, string][] = [
  ['general', 'General Discussion', 'Anything about Kubox that does not fit elsewhere.'],
  ['clans', 'Clans & Guilds', 'Recruitment, declarations of war, alliances, raid reports.'],
  ['deals', "Let's Make a Deal", 'Trading limiteds. Post what you have and what you want.'],
  ['scripting', 'Scripting Helpers', 'Luau questions and answers. Post your code and the error.'],
  ['ideas', 'Suggestions', 'Tell the team what to build next. Staff read this board.'],
  ['offtopic', 'Off Topic', 'Everything else. Keep it civil.']
];

export async function migrate(db: DB): Promise<void> {
  await db.exec(SCHEMA);
  for (let i = 0; i < BOARDS.length; i++) {
    await db.query('insert into boards (id, name, description, position) values ($1,$2,$3,$4) on conflict (id) do nothing', [...BOARDS[i], i]);
  }
}
