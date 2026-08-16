export interface Env {
  DB: D1Database;
}

export interface SessionUser {
  id: string;
  isAdmin: boolean;
}

const SESSION_COOKIE = 'session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 365; // 1년

// 비밀번호 해싱 파라미터. scripts/seed-admin.mjs가 정확히 같은 방식으로
// 해시를 계산하므로, 이 값들을 바꾸면 그 스크립트도 함께 맞춰야 한다.
const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_LENGTH_BITS = 256;

function bufToHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.substr(i * 2, 2), 16);
  return arr;
}

async function deriveHash(password: string, salt: Uint8Array): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    KEY_LENGTH_BITS
  );
  return bufToHex(derived);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await deriveHash(password, saltBytes);
  return { hash, salt: bufToHex(saltBytes) };
}

async function verifyPassword(password: string, saltHex: string, hashHex: string): Promise<boolean> {
  const computed = await deriveHash(password, hexToBytes(saltHex));
  return timingSafeEqualHex(computed, hashHex);
}

function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get('Cookie') || '';
  const out: Record<string, string> = {};
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  });
  return out;
}

export function sessionCookieHeader(token: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export async function createSession(env: Env, userId: string): Promise<string> {
  const token = crypto.randomUUID() + crypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  await env.DB.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(token, userId, expiresAt)
    .run();
  return token;
}

export async function destroySession(env: Env, token: string): Promise<void> {
  await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
}

export async function getSessionUser(request: Request, env: Env): Promise<SessionUser | null> {
  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    `SELECT users.id as id, users.is_admin as is_admin
     FROM sessions JOIN users ON users.id = sessions.user_id
     WHERE sessions.token = ? AND sessions.expires_at > ?`
  )
    .bind(token, nowSeconds)
    .first<{ id: string; is_admin: number }>();

  if (!row) return null;
  return { id: row.id, isAdmin: row.is_admin === 1 };
}

/** 아이디/비밀번호로 새 계정을 만든다. 아이디가 이미 사용 중이면 예외를 던진다(PK 제약 위반). */
export async function createAccount(env: Env, id: string, password: string): Promise<SessionUser> {
  const { hash, salt } = await hashPassword(password);
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    'INSERT INTO users (id, password_hash, password_salt, is_admin, created_at) VALUES (?, ?, ?, 0, ?)'
  )
    .bind(id, hash, salt, now)
    .run();
  return { id, isAdmin: false };
}

/** 아이디/비밀번호를 검증한다. 실패 시 null (아이디 없음/비밀번호 불일치를 구분해 알려주지 않는다). */
export async function verifyLogin(env: Env, id: string, password: string): Promise<SessionUser | null> {
  const row = await env.DB.prepare('SELECT id, password_hash, password_salt, is_admin FROM users WHERE id = ?')
    .bind(id)
    .first<{ id: string; password_hash: string; password_salt: string; is_admin: number }>();
  if (!row) return null;

  const ok = await verifyPassword(password, row.password_salt, row.password_hash);
  if (!ok) return null;

  return { id: row.id, isAdmin: row.is_admin === 1 };
}
