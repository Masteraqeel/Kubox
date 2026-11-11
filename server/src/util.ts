import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Context } from 'hono';
import type { DB } from './db.ts';

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export type User = { id: number; username: string; role: string; colors: string };
export type Env = { Variables: { user: User | null } };
export type Ctx = Context<Env>;
export type Options = { db: DB; secureCookies: boolean; rateLimit: boolean; staticRoot?: string };

export const sha = (s: string) => createHash('sha256').update(s).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${(await scryptAsync(pw, salt, 64)).toString('hex')}`;
}
export async function checkPassword(pw: string, stored: string): Promise<boolean> {
  const [kind, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'hex');
  const got = await scryptAsync(pw, Buffer.from(salt, 'hex'), want.length);
  return timingSafeEqual(want, got);
}

/** Read a trimmed string field and enforce its length. */
export function str(body: any, key: string, min: number, max: number, label = key): string {
  const v = typeof body?.[key] === 'string' ? body[key].trim() : '';
  if (v.length < min) throw new HttpError(400, min <= 1 ? `${label} is required.` : `${label} must be at least ${min} characters.`);
  if (v.length > max) throw new HttpError(400, `${label} must be at most ${max} characters.`);
  return v;
}
export const HEX = /^#[0-9a-f]{6}$/i;
export function hex(body: any, key: string, label = key): string {
  const v = String(body?.[key] ?? '');
  if (!HEX.test(v)) throw new HttpError(400, `${label} must be a colour such as #2b6fd9.`);
  return v.toLowerCase();
}
export function intParam(v: string | undefined, label = 'id'): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(400, `Invalid ${label}.`);
  return n;
}
export const page = (c: Ctx) => { const n = Number(c.req.query('page')); return Number.isInteger(n) && n > 0 ? n : 1; };
export const json = async (c: Ctx): Promise<any> => (await c.req.json().catch(() => null)) ?? {};

export const pub = (username: string, colors: string) => ({ username, colors: colors.split(',') });
export function need(c: Ctx): User {
  const u = c.get('user');
  if (!u) throw new HttpError(401, 'Log in to do that.');
  return u;
}
export const isMod = (u: User | null) => !!u && (u.role === 'mod' || u.role === 'admin');
export function needMod(c: Ctx): User {
  const u = need(c);
  if (!isMod(u)) throw new HttpError(403, 'Moderators only.');
  return u;
}

/** Fixed-window in-memory rate limiter. One process only; move to the database before running several instances. */
export function limiter(enabled: boolean) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (key: string, max: number, windowMs: number) => {
    if (!enabled) return;
    const now = Date.now();
    if (hits.size > 50000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    const h = hits.get(key);
    if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + windowMs }); return; }
    if (++h.n > max) throw new HttpError(429, 'Too many attempts. Wait a few minutes and try again.');
  };
}
export type Limit = ReturnType<typeof limiter>;
export const ip = (c: Ctx) => (c.req.header('x-forwarded-for') || 'local').split(',')[0].trim();
export const isUnique = (e: any) => e?.code === '23505';
