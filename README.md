# Kubox (prototype 0.1)

A clickable prototype of a community-first brick game platform: forums, war groups, trainings, limiteds trading and very simple games.

Everything runs in the browser. There is no backend, no accounts and no multiplayer yet. All players, prices and posts are sample data.

## View it

- **GitHub Pages:** repo Settings → Pages → Source: "Deploy from a branch" → `main` / root. The site appears at `https://<user>.github.io/<repo>/`.
- **Locally:** `python3 -m http.server` in this folder, then open `http://localhost:8000`.

## What is in it

| Area | Route | Notes |
| --- | --- | --- |
| Home | `#home` | Group shouts, friends, events, latest forum threads |
| Games | `#games`, `#play-sandbox`, `#play-training`, `#play-arena` | Three playable places |
| Forum | `#forum`, `#forum-clans`, `#thread-101` | Boards, threads, working replies |
| Groups | `#groups`, `#group-ironlegion` | Ranks, allies, enemies, events, wall, join and leave |
| Catalog | `#catalog`, `#item-1` | Limiteds with stock, serials, sale chart, resellers |
| Trade | `#trade` | Two-sided trade window with value comparison |
| Profiles | `#profile`, `#user-novaquill` | Inventory, groups, stats |

Replies, wall posts, purchases, trades and the sandbox build are kept in `localStorage` in the visitor's browser only.

## The brick demo

- 1 unit = 1 stud. Bricks sit on an integer grid.
- W A S D or arrows to move, Space to jump, drag to turn the camera, scroll to zoom.
- Tools: `1` Build, `2` Delete, `3` Sword. `Q`/`E` change brick size, `R` rotates.
- Physics is a small box-versus-box solver in `js/game.js`. It is a stand-in for the real engine.

## Files

```
index.html        page shell and navigation
css/site.css      all styling
js/data.js        sample data (users, groups, threads, items, trades)
js/app.js         hash router and every website view
js/game.js        the 3D brick demo
vendor/           three.js r128 (MIT licence)
```

## Not built yet

1. Accounts, a database and a real forum backend.
2. Multiplayer with server-authoritative game servers.
3. A native client and editor (planned: Godot fork, Jolt physics, Luau scripting).
4. A real limiteds market with a closed-loop currency.
5. Moderation tooling.

No Roblox code, assets or names are used anywhere in this repository.
