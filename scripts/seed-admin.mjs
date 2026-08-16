// 관리자 계정을 D1에 생성/재설정한다. 비밀번호를 코드에 하드코딩하지 않고 인자로 받는다
// (깃 저장소에 실제 비밀번호가 남지 않도록 하기 위함).
//
// 사용법:
//   node scripts/seed-admin.mjs --id=JJHL --password=실제비밀번호           (로컬 D1)
//   node scripts/seed-admin.mjs --id=JJHL --password=실제비밀번호 --remote  (배포된 원격 D1, wrangler login 필요)
// 또는 ADMIN_ID / ADMIN_PASSWORD 환경변수로 전달해도 된다.
//
// functions/_lib/auth.ts와 정확히 같은 해싱 방식(PBKDF2-SHA256)을 사용한다.
// 두 파일의 PBKDF2_ITERATIONS/SALT_BYTES/KEY_LENGTH_BITS 값은 항상 같아야 한다.

import { writeFileSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const crypto = webcrypto;

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_LENGTH_BITS = 256;

function bufToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    KEY_LENGTH_BITS
  );
  return { hash: bufToHex(derived), salt: bufToHex(salt) };
}

function parseArg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

const adminId = parseArg('id') ?? process.env.ADMIN_ID;
const adminPassword = parseArg('password') ?? process.env.ADMIN_PASSWORD;

if (!adminId || !adminPassword) {
  console.error(
    [
      '사용법: node scripts/seed-admin.mjs --id=<아이디> --password=<비밀번호> [--remote]',
      '(또는 ADMIN_ID / ADMIN_PASSWORD 환경변수로 전달)',
      '비밀번호를 코드에 저장하지 않으므로 실행할 때마다 직접 전달해야 합니다.',
    ].join('\n'),
  );
  process.exit(1);
}

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const remote = process.argv.includes('--remote');
const flag = remote ? '--remote' : '--local';

const { hash, salt } = await hashPassword(adminPassword);
const now = Math.floor(Date.now() / 1000);

const sql = `INSERT INTO users (id, password_hash, password_salt, is_admin, created_at)
VALUES ('${adminId}', '${hash}', '${salt}', 1, ${now})
ON CONFLICT(id) DO UPDATE SET password_hash = excluded.password_hash, password_salt = excluded.password_salt, is_admin = 1;
`;

const tmpFile = path.join(rootDir, 'scripts', '.seed-admin-tmp.sql');
writeFileSync(tmpFile, sql, 'utf8');

try {
  console.log(`관리자 계정(${adminId})을 ${remote ? '원격' : '로컬'} D1에 생성/갱신합니다...`);
  execSync(`npx wrangler d1 execute jjhl-studio-db ${flag} --file "${tmpFile}"`, {
    cwd: rootDir,
    stdio: 'inherit',
  });
  console.log(`완료되었습니다. ID: ${adminId} 로 로그인할 수 있습니다.`);
} finally {
  unlinkSync(tmpFile);
}
