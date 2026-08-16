// JJHL_STUDIO 빌드 스크립트
// 1) site/ 정적 파일을 public/ 으로 복사
// 2) song-app(React/Vite)을 빌드해 public/song/ 에 병합
// Cloudflare Pages 빌드 커맨드: npm install && npm run build (출력 디렉터리: public)

import { existsSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const siteDir = path.join(rootDir, 'site');
const songAppDir = path.join(rootDir, 'song-app');
const publicDir = path.join(rootDir, 'public');

function run(command, cwd) {
  console.log(`\n$ ${command}  (cwd: ${cwd})`);
  execSync(command, { cwd, stdio: 'inherit' });
}

console.log('--- 1) public/ 초기화 후 site/ 복사 ---');
rmSync(publicDir, { recursive: true, force: true });
mkdirSync(publicDir, { recursive: true });
cpSync(siteDir, publicDir, { recursive: true });

console.log('\n--- 2) song-app(노래방 자막 제작기) 빌드 ---');
if (!existsSync(path.join(songAppDir, 'node_modules'))) {
  run('npm install', songAppDir);
}
run('npm run build', songAppDir);

const songDistDir = path.join(songAppDir, 'dist');
const songPublicDir = path.join(publicDir, 'song');
mkdirSync(songPublicDir, { recursive: true });
cpSync(songDistDir, songPublicDir, { recursive: true });

console.log('\n빌드 완료: public/ 디렉터리를 Cloudflare Pages 출력 디렉터리로 사용하세요.');
