import { serve } from '@hono/node-server';
import { resolve } from 'node:path';
import { createApp } from './app.ts';
import { createUser } from './auth.ts';
import { openDb } from './db.ts';
import { migrate } from './schema.ts';

const env = process.env, prod = env.NODE_ENV === 'production';
if (prod && !env.DATABASE_URL) { console.error('DATABASE_URL is required in production.'); process.exit(1); }

const db = await openDb(env.DATABASE_URL, env.DATABASE_URL ? undefined : resolve(import.meta.dirname, '../.devdata'));
await migrate(db);

// First run: create the admin account and a starting invite code from the environment.
const admin = { username: env.ADMIN_USERNAME ?? (prod ? '' : 'Founder'), email: env.ADMIN_EMAIL ?? (prod ? '' : 'founder@example.com'), password: env.ADMIN_PASSWORD ?? (prod ? '' : 'kubox-dev-password') };
const users = await db.query('select count(*)::int as n from users');
if (users.rows[0].n === 0) {
  if (admin.username && admin.email && admin.password.length >= 8) {
    await createUser(db, { ...admin, role: 'admin' });
    console.log(`Created admin account "${admin.username}".`);
  } else console.warn('No users exist. Set ADMIN_USERNAME, ADMIN_EMAIL and ADMIN_PASSWORD (8+ characters) and restart to create the admin.');
}
const invite = (env.INVITE_CODE ?? (prod ? '' : 'KUBOX-DEV')).toUpperCase();
if (invite) {
  await db.query('insert into invites (code, max_uses) values ($1, $2) on conflict (code) do nothing', [invite, Number(env.INVITE_USES) || 50]);
  if (!prod) console.log(`Development invite code: ${invite}`);
}

const app = createApp({ db, secureCookies: prod, rateLimit: true, staticRoot: resolve(import.meta.dirname, '../..') });
const port = Number(env.PORT) || 3000;
serve({ fetch: app.fetch, port }, () => console.log(`Kubox is running on http://localhost:${port}`));
