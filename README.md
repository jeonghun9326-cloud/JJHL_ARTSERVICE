# JJHL_STUDIO

JJHL 유튜브 채널 & 개발 프로젝트를 위한 통합 웹 서비스. GitHub 저장소를 Cloudflare Pages에 연결하면 정적 사이트 + API(Cloudflare Pages Functions + D1)가 함께 배포되도록 구성되어 있습니다.

## 기능

1. **홈 화면** (`site/index.html`) — 전체 서비스로 진입하는 히어로 카드 목록
2. **Suno 키워드 레퍼런스** (`/suno/`) — Suno AI 프롬프트 키워드를 브라우저에서 바로 조합 (완전 클라이언트 사이드)
3. **노래방 자막 제작기** (`/song/`) — 보컬+가사로 노래방 스타일 자막 제작 (React/Vite, `song-app/`)
4. **오디오 클리너** (`site/audio-clean.html`) — 브라우저 Web Audio API로 EQ·컴프레서·볼륨을 실시간 적용, 서버 없이 완전 클라이언트 사이드 (AI 노이즈 제거는 로컬 서버가 있어야 하는 기능이라 배포 사이트에서는 제외됨 — 아래 "알려진 제한사항" 참고)
5. **아이디/비밀번호 계정** — 이메일 인증 없이 아이디+비밀번호만으로 가입/로그인 (Cloudflare Pages Functions + D1, 비밀번호는 PBKDF2-SHA256 해시로 저장)
6. **커뮤니티** (`site/community.html`) — 게시판형 글쓰기/댓글 (읽기는 공개, 쓰기는 로그인 후 이용 가능, 관리자는 다른 사람 글도 삭제 가능)

## 폴더 구조

```
site/           손으로 관리하는 정적 사이트 소스 (빌드 시 public/ 로 복사됨)
song-app/       노래방 자막 제작기 (React+Vite, 빌드 시 public/song/ 로 병합됨)
functions/      Cloudflare Pages Functions (백엔드 API, /api/*)
scripts/build.mjs  빌드 오케스트레이션 스크립트
schema.sql      D1 데이터베이스 스키마
wrangler.jsonc  Cloudflare Pages 설정 (D1 바인딩)
public/         빌드 산출물 (git에 커밋하지 않음, npm run build로 생성)
```

## 로컬 개발

```bash
npm install
npm run build        # site/ 복사 + song-app 빌드 → public/
npx wrangler d1 execute jjhl-studio-db --local --file schema.sql   # 최초 1회
npm run dev           # wrangler pages dev ./public (로컬 D1 시뮬레이션 사용)
```

`http://localhost:8788` 에서 전체 사이트를 확인할 수 있습니다.

관리자 계정을 로컬 D1에 만들려면 (비밀번호를 코드에 저장하지 않으므로 직접 입력):
```bash
npm run seed:admin -- --id=<아이디> --password=<비밀번호>
```

## GitHub → Cloudflare Pages 배포 준비 (수동 단계)

이 저장소는 배포 가능한 상태로 준비되어 있지만, 아래 단계는 계정 정보가 필요해 직접 진행해야 합니다.

### 1. GitHub 저장소 생성 & push
```bash
git remote add origin <저장소 URL>
git push -u origin main
```

### 2. Cloudflare Pages 프로젝트 연결
- Cloudflare 대시보드 → Workers & Pages → 프로젝트 만들기 → GitHub 저장소 연결
- 빌드 명령어: `npm install && npm run build`
- 빌드 출력 디렉터리: `public`
- Functions 디렉터리는 저장소 루트의 `functions/`를 자동 인식합니다

### 3. D1 데이터베이스 생성
```bash
npx wrangler d1 create jjhl-studio-db
# 출력된 database_id를 wrangler.jsonc의 d1_databases[0].database_id에 반영
npx wrangler d1 execute jjhl-studio-db --remote --file schema.sql
```
Cloudflare Pages 대시보드의 Settings → Functions → D1 database bindings에서도 `DB` 바인딩을 동일한 데이터베이스로 연결해야 합니다.

### 4. 관리자 계정 생성 (원격 D1)
```bash
npm run seed:admin -- --id=<아이디> --password=<비밀번호> --remote
```
지정한 아이디/비밀번호로 계정을 만들고(이미 있으면 비밀번호와 관리자 권한만 갱신) `is_admin=1`로 설정합니다. 관리자는 다른 사람이 쓴 게시글도 삭제할 수 있습니다.

## 계정/보안 관련 참고

- 아이디/비밀번호만으로 가입하는 **간단 계정 시스템**입니다(이메일 인증, 결제, 소유 아이템 없음). 아이디는 영문/숫자/밑줄만 가능하고 대소문자 구분 없이 유일해야 합니다(`schema.sql`의 `COLLATE NOCASE`).
- 비밀번호는 PBKDF2-SHA256(솔트 + 100,000회 반복)으로 해시해 저장하며 평문으로 저장하지 않습니다. 로그인 성공 시 서버가 세션 쿠키(`HttpOnly`, 1년 만료)를 발급합니다.
- 비밀번호 찾기/재설정 기능은 없습니다. 비밀번호를 잊으면 같은 아이디로는 복구할 방법이 없습니다(관리자 계정은 `npm run seed:admin -- --id=... --password=...`으로 비밀번호를 다시 설정할 수 있음).
- `scripts/seed-admin.mjs`와 `functions/_lib/auth.ts`는 반드시 같은 해싱 파라미터(PBKDF2 반복 횟수 등)를 사용해야 합니다. 한쪽만 바꾸면 관리자 계정 로그인이 깨집니다.
- `seed-admin.mjs`는 비밀번호를 코드에 저장하지 않고 인자(또는 `ADMIN_ID`/`ADMIN_PASSWORD` 환경변수)로만 받습니다 — 실수로 실제 비밀번호를 커밋해 깃 히스토리에 영구히 남기지 않도록, 절대 이 값을 스크립트 안에 하드코딩하지 마세요.
- 별도의 스팸/신고/차단 기능은 없는 MVP입니다. 악용이 우려되면 D1의 `users`/`posts`/`comments` 테이블을 직접 조회해 관리하세요.

## 알려진 제한사항

- **노래방 자막 제작기(`/song/`)에는 "실제 음성인식 정렬(Forced Alignment)"과 "mp4/WebM 영상 렌더링" 기능이 없습니다.** 둘 다 로컬 Python 서버(`song-app/alignment-server`, FastAPI+torch+ffmpeg)가 있어야 동작하는데, 그 서버 역시 항상 "방문자 자신의 PC"에서 실행돼야 해서 배포된 사이트에서는 서버를 실행한 사람 본인 외에는 아무도 쓸 수 없어 UI에서 제거했습니다(자세한 이유는 아래 "오디오 클리너" 항목과 동일). 파형 에너지 기반 자동 정렬, 수동 타이밍 입력, SRT/ASS 자막 내보내기, 브라우저 노래방 미리보기는 전부 서버 없이 100% 동작합니다. `song-app/alignment-server`의 코드 자체는 남아 있으니 로컬에서 개인적으로 실행하며 개발/실험할 수 있고, 여러 사용자가 함께 쓰게 하려면 그 서버를 공개적으로(항상 켜져 있는 호스트에) 올린 뒤 프론트엔드를 다시 연결해야 합니다.
- **오디오 클리너(`site/audio-clean.html`)에는 AI 노이즈 제거("완전자동") 기능이 없습니다.** 별도 저장소 `E:\JJHL_NOISE`에 이 기능을 위한 로컬 서버(`server_main.py`, FastAPI+torch+DeepFilterNet)를 만들어뒀지만, 그 서버는 항상 "지금 이 페이지를 보고 있는 사람 자신의 PC"에서 실행돼야 동작하는 구조라 — 배포된 사이트에서는 서버를 실행한 그 사람 본인 외에는 아무도 쓸 수 없어 웹 페이지에서는 제외했습니다. `E:\JJHL_NOISE`의 서버 코드 자체는 그대로 남아 있어 로컬에서 개인적으로 사용할 수 있습니다. 나중에 이 서버를 실제로 어딘가(항상 켜져 있는 클라우드 서버 등)에 공개 호스팅하면, 업로드 용량 제한/요청 속도 제한 같은 악용 방지 장치를 먼저 추가한 뒤 웹 페이지에 다시 연결할 수 있습니다.
