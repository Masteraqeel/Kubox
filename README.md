# Kubox (0.2)

A community-first brick game platform: forums, war groups, trainings, limiteds trading and very simple games.

The repository has two parts:

- **The website** (`index.html`, `css/`, `js/`): a static site. Opened without a server it runs on sample data, which is what GitHub Pages shows.
- **The server** (`server/`): a Node and TypeScript API on Postgres. It serves the same website and makes accounts, the forum, groups and moderation real.

The catalog, trading and the games still use sample data in both modes.

## Run it locally

Needs Node 22.18 or newer. No database setup is required: without `DATABASE_URL` the server uses an embedded Postgres stored in `server/.devdata`.

```
cd server
npm install
npm start
```

Open http://localhost:3000. The development admin is `Founder` / `kubox-dev-password` and the invite code is `KUBOX-DEV`.

`npm test` runs the API tests. `npm run typecheck` checks the types.

## Deploy it

One container serves the site and the API. Any host that runs a Dockerfile and offers Postgres works (Render, Railway, Fly and similar).

1. Create a Postgres database on the host and copy its connection string.
2. Create a web service from this repository. It builds from the `Dockerfile` in the root.
3. Set the environment variables listed in `server/.env.example`: `DATABASE_URL`, `ADMIN_USERNAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and optionally `INVITE_CODE` and `INVITE_USES`.
4. Deploy. Tables are created on the first start, along with the admin account and the invite code.
5. Log in as the admin, then create more invite codes from your profile page.

The site must be served over HTTPS in production, because the session cookie is marked Secure.

## What the server does

| Area | Details |
| --- | --- |
| Accounts | Invite-only sign-up with an 18+ confirmation. Passwords hashed with scrypt. Sessions in an HttpOnly cookie, 30 days. |
| Invites | Members get three single-use codes. Admins create codes with any number of uses. |
| Forum | Six boards, threads, replies, pagination, pin and lock, authors and moderators can remove posts. |
| Groups | Create, join, leave. Ranks by level (owner 255, officers 200+). Shout, wall, events. Officers manage lower ranks. Enemies are one-sided, allies need acceptance. |
| Moderation | Report posts and wall posts. Moderators see a queue, remove content and ban accounts. Admins appoint moderators. |
| Protection | Writes need an `X-Kubox` header (blocks cross-site form posts). Rate limits on sign-up, login and posting. All text is escaped by the browser code. |

Known gaps: no email verification or password reset (there is no mail service yet), the 18+ check is a self-declaration, group ownership cannot be transferred, and rate limits live in memory so they suit a single server instance.

## Website routes

| Area | Route |
| --- | --- |
| Home | `#home` |
| Log in, sign up | `#login`, `#register` (server only) |
| Games | `#games`, `#play-sandbox`, `#play-training`, `#play-arena` |
| Forum | `#forum`, `#forum-clans`, `#thread-101` |
| Groups | `#groups`, `#group-ironlegion` |
| Catalog and trade | `#catalog`, `#item-1`, `#trade` (sample data) |
| Profiles | `#profile`, `#user-name` |
| Moderation | `#mod` (server only, moderators) |

## The brick demo

- 1 unit = 1 stud. Bricks sit on an integer grid.
- W A S D or arrows to move, Space to jump, drag to turn the camera, scroll to zoom.
- Tools: `1` Build, `2` Delete, `3` Sword. `Q`/`E` change brick size, `R` rotates.
- Physics is a small box-versus-box solver in `js/game.js`. It is a stand-in for the real engine.

## Files

```
index.html          page shell and navigation
css/site.css        all styling
js/data.js          sample data
js/app.js           router and the sample-data views
js/live.js          live mode: talks to the API when the server is present
js/game.js          the 3D brick demo
vendor/             three.js r128 (MIT licence), used as a fallback to the CDN copy
Dockerfile          production image
server/src/         API: auth, forum, groups, moderation, schema
server/test/        API tests
```

## Not built yet

1. Email verification and password reset.
2. The economy: Bits balances, catalog purchases, limiteds with serials, server-enforced trades.
3. Multiplayer with server-authoritative game servers.
4. A native client and editor (planned: Godot fork, Jolt physics, Luau scripting).

No Roblox code, assets or names are used anywhere in this repository.
