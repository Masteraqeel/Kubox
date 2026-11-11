import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { authRoutes } from './auth.ts';
import { forumRoutes } from './forum.ts';
import { groupRoutes } from './groups.ts';
import { modRoutes } from './mod.ts';
import { HttpError, limiter } from './util.ts';
import type { Env, Options } from './util.ts';

const TYPES: Record<string, string> = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', png: 'image/png', svg: 'image/svg+xml', ico: 'image/x-icon' };
// Only the website's own files are served. Server source, .git and everything else is unreachable.
const STATIC = /^(index\.html|(css|js|vendor)\/[\w.-]+\.(css|js))$/;

export function createApp(o: Options) {
  const app = new Hono<Env>();
  const limit = limiter(o.rateLimit);

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status as 400);
    console.error(err);
    return c.json({ error: 'Something went wrong on the server.' }, 500);
  });

  authRoutes(app, o, limit);
  forumRoutes(app, o, limit);
  groupRoutes(app, o, limit);
  modRoutes(app, o, limit);
  app.get('/api/places', c => c.json({ playing: o.places ? o.places() : {} }));
  app.all('/api/*', c => c.json({ error: 'No such endpoint.' }, 404));
  app.get('/healthz', c => c.text('ok'));

  if (o.staticRoot) {
    const root = o.staticRoot;
    app.get('*', async c => {
      const path = c.req.path === '/' ? 'index.html' : c.req.path.slice(1);
      if (!STATIC.test(path)) return c.text('Not found', 404);
      try {
        const data = await readFile(join(root, path));
        return c.body(data, 200, { 'content-type': TYPES[path.split('.').pop()!] ?? 'application/octet-stream', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
      } catch { return c.text('Not found', 404); }
    });
  }
  return app;
}
