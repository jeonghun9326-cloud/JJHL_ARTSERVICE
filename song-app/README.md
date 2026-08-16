# 노래방 자막 제작기 (Karaoke Subtitle Maker) — MVP

보컬 오디오 파일과 전체 가사를 입력하면, 한글 음절 단위로 타이밍을 잡고
노래방처럼 좌→우로 색이 채워지는 자막을 미리보기할 수 있는 로컬 웹 앱입니다.

## 기술 스택 및 선택 이유

| 영역 | 선택 | 이유 |
|---|---|---|
| 앱 형태 | 순수 프론트엔드 (React + TypeScript + Vite) | 별도 백엔드 서버 없이 `npm run dev` 한 줄로 로컬 실행 가능. 유료 API 불필요 |
| 상태 관리 | Zustand | 오디오/타이밍/재생 상태가 얽혀 있어 가벼운 전역 스토어가 적합 |
| 파형/재생 | WaveSurfer.js v7 (+ Regions 플러그인) | DAW 스타일 파형, 구간(리전) 드래그/리사이즈, 줌, 클릭 탐색을 기본 제공 |
| 오디오 분석 | Web Audio API (`AudioContext.decodeAudioData`) | 브라우저 내장 기능만으로 파형/RMS 분석 가능, 추가 설치 불필요 |
| 저장소 | IndexedDB(오디오 바이너리) + JSON 파일(프로젝트) | 오디오 원본은 브라우저 로컬에, 프로젝트 메타데이터는 이식 가능한 JSON으로 |
| 정렬(Alignment) | `AlignmentService` 인터페이스 — ① 에너지 기반 휴리스틱(기본) ② 한국어 wav2vec2 CTC Forced Alignment(선택, 로컬 Python 서버) | 정확한 정렬에는 한국어 음향모델/ML 런타임이 필요해 별도 프로세스로 분리. 서버 없이도 ①만으로 앱은 완전히 동작 |

## 실행 방법

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:5173` 접속. (Windows PC 로컬 실행 기준, 별도 서버/설치 불필요)

프로덕션 빌드:

```bash
npm run build
npm run preview
```

## 폴더 구조

```
src/
  types/project.ts            데이터 구조 정의 (Syllable, LyricLine, KaraokeProject, SubtitleStyle)
  services/
    lyricsParser.ts           가사 원문 → 줄/음절 구조 파싱, 타이밍 보존 재파싱
    AlignmentService.ts       정렬 서비스 공통 인터페이스 (계약만 정의)
    alignment/
      EnergyBasedAlignmentService.ts   파형 에너지 기반 휴리스틱 구현체 (기본, 서버 불필요)
      RemoteAlignmentService.ts        alignment-server와 통신하는 실제 Forced Alignment 구현체
      alignmentTokens.ts               가사를 "노래 순서" 토큰 시퀀스로 변환 (정렬 서버 전송용)
    ProjectStorage.ts         IndexedDB 오디오 저장 + 프로젝트 JSON 직렬화/다운로드
    srtExport.ts               줄 단위 SRT 자막 파일 생성/다운로드 (리릭 비디오 등 영상 편집용)
    assExport.ts                줄별 폰트 크기/색상을 지정할 수 있는 ASS 자막 파일 생성/다운로드
    karaokeVideoExport.ts        음절 단위 \kf 카라오케 ASS 생성 + alignment-server에 mp4 렌더링 요청
    audio.ts                  AudioContext 디코딩 헬퍼
  store/useProjectStore.ts    전역 상태(Zustand): 프로젝트, 재생, 수동 타이밍, 정렬 엔진/진행상태
  components/
    AudioUpload/               보컬 파일 업로드
    WaveformEditor/             파형 표시, 재생/줌/클릭탐색, 음절 리전 드래그 수정
    LyricsInput/                 전체 가사 입력(줄바꿈 유지)
    ManualTimingPanel/           Space 탭 타이밍 입력, Backspace 되돌리기
    KaraokePreview/               노래방 미리보기(음절 내부 좌→우 색 채우기)
    AlignmentControls/            정렬 엔진 선택, 보컬분리 토글, 서버 상태, 실행 버튼/진행률
    VideoExport/                   노래방 mp4 렌더링 요청/다운로드 (노래방 미리보기 탭)
    ProjectControls/               새 프로젝트/저장/불러오기
    StylePanel/                    자막 색상/글자크기 설정
  utils/
    hangul.ts                  한글 완성형 음절 판별 및 줄 → 음절 토큰 분리
    time.ts                    시간 포맷 유틸
    wav.ts                     AudioBuffer → WAV Blob 인코딩 (정렬 서버 전송용)

alignment-server/             (선택) 실제 음성인식 정렬 + mp4 렌더링 로컬 서버 — 별도 README 참고
  app.py                        FastAPI 앱, /health, /align, /render-video
  asr_align.py                  wav2vec2 CTC 모델 로딩, 타겟 토큰 매핑
  vocal_separation.py           Hybrid Demucs 기반 보컬 분리
  video_render.py               ffmpeg(libx264+libass) subprocess로 노래방 mp4 렌더링
  requirements.txt
```

## 데이터 구조

```ts
interface Syllable {
  id: string              // "L{lineIndex}-S{syllableIndex}"
  text: string             // 화면에 표시되는 음절(한글 1자 또는 영문/숫자 묶음)
  start: number | null     // 초 단위 시작 시간
  end: number | null       // 초 단위 종료 시간
  lineIndex: number
  syllableIndex: number
}
```

공백/줄바꿈은 타이밍 대상에서 제외되고, 완성형 한글(가-힣) 한 글자를 1음절로 취급합니다.
(`src/utils/hangul.ts`의 `segmentLineToTokens`)

## 실제 음성인식 기반 정렬 (Forced Alignment) — 선택 기능

기본 정렬(파형 에너지 휴리스틱)은 "소리가 나는 구간"만 찾을 뿐 실제 발음을 인식하지 않아
가사와 타이밍이 어긋나기 쉽습니다. 이를 보완하기 위해 로컬 Python 서버
(`alignment-server/`)를 추가로 실행하면 **실제 한국어 음성인식 모델로 가사를 오디오에
강제 정렬**할 수 있습니다.

- 모델: `kresnik/wav2vec2-large-xlsr-korean` (오픈소스, 무료, 최초 실행 시 자동 다운로드)
- 방식: 자유 인식(transcription)이 아니라, 사용자가 입력한 가사 텍스트 순서를 오디오
  시간축에 강제로 맞추는 **Forced Alignment** (`torchaudio.functional.forced_align`)
- (선택) 반주가 섞인 곡은 `torchaudio` 내장 Hybrid Demucs로 보컬만 분리한 뒤 정렬해 정확도를 높임
- 실행 방법 및 API는 [`alignment-server/README.md`](alignment-server/README.md) 참고

**검증 결과**: 한국어 TTS로 생성한 실제 발화 오디오("가끔은 궁금했어 지금은 뭘 하고
있을지")로 종단간 테스트를 했을 때, 무음 구간 분석(ffmpeg silencedetect)으로 확인한
실제 발화 구간(0.22s~2.97s)과 정렬 결과(0.22s~2.86s)가 정확히 일치했습니다. 파형
위에 배치된 음절 경계도 실제 파형의 진폭 구간과 시각적으로 정확히 겹칩니다.

이 서버는 완전히 선택 사항입니다 — 실행하지 않아도 에너지 휴리스틱 정렬과 수동
타이밍 입력 등 나머지 기능은 그대로 동작합니다.

## 구현된 기능 (MVP, 실제 브라우저에서 동작 확인 완료)

- [x] 보컬 파일 업로드 (WAV/MP3)
- [x] 파형 표시 (DAW 스타일, 확대/축소, 재생헤드, 클릭 탐색, 0.5x~1.5x 재생 배속)
- [x] **싱크 정밀 조정 보조 기능** — 음절 블록을 클릭해 선택한 뒤 방향키로 시작/종료 시각을 10ms(Shift: 50ms) 단위로 미세 조정, 수동 탭 입력에는 사람의 반응 지연을 보정하는 "반응속도 보정" 슬라이더 제공
- [x] 전체 가사 입력 (줄바꿈 구조 유지)
- [x] 한글 음절 자동 분리 (예: "가끔은 궁금했어" → 가/끔/은/궁/금/했/어)
- [x] 자동 타이밍 추정 — 파형 에너지 휴리스틱(기본) + **실제 한국어 음성인식 Forced Alignment(선택, 로컬 서버)**, UI에서 엔진 전환 가능
- [x] 파형 위 음절 리전 표시 + 드래그로 시작/종료 시간 수정
- [x] 실시간 수동 타이밍 입력 (Space로 다음 음절 기록, Backspace로 되돌리기)
- [x] 노래방 미리보기 — 현재 줄/다음 줄 표시, **음절 내부 좌→우 그라데이션 채우기 효과**
- [x] 프로젝트 저장(.json 다운로드) / 불러오기
- [x] **SRT 자막 파일 내보내기 (줄 단위)** — 노래방 음절 채우기 없이, 영상 편집 프로그램(프리미어, 리졸브 등)에서 바로 불러올 수 있는 표준 SRT를 생성. 줄의 시작/종료 시간은 그 줄에 속한 음절들의 최소 시작~최대 종료로 계산되어, 음절 단위 타이밍(자동 정렬 또는 수동 탭)만 있으면 별도 작업 없이 바로 내보낼 수 있음. "노래방처럼 다음 줄 미리보기 포함"을 켜면 `.srt`(현재 줄)와 `.preview.srt`(다음 줄, 같은 시간대)를 별도 파일 2개로 내보냄 — CapCut처럼 자막 파일 하나에 스타일을 하나만 적용할 수 있는 편집기에서도, 두 파일을 별도 트랙으로 불러와 트랙마다 다른 글자 크기를 지정하면 노래방처럼 보이게 만들 수 있음
- [x] **노래방 영상 내보내기 (mp4 / 투명 WebM)** — 음절 단위 타이밍이 모두 입력된 줄을 대상으로, ASS의 `\kf`(karaoke fill) 태그로 실제 좌→우 채우기 자막을 만들고 로컬 서버가 ffmpeg(libass)로 구워 렌더링. "노래방 미리보기" 탭에서 실행하며, alignment-server + 시스템 ffmpeg가 필요.
  - 기본: 단색 배경 mp4 (libx264)
  - "배경 없이 텍스트만" 옵션: 알파 채널을 지원하는 투명 WebM(libvpx-vp9). mp4/H.264는 알파 채널을 지원하지 않아 완전한 투명 mp4는 만들 수 없으므로, 다른 영상 위에 합성용으로 쓸 때는 이 옵션을 사용. `ass` 필터가 알파를 직접 다루지 못해(텍스트까지 투명해짐, 실측 확인) 크로마키 배경 위에 자막을 그린 뒤 `colorkey`로 배경만 제거하는 2단계 방식을 사용. 실제 브라우저 재생으로 배경 전체가 투명하게 비치는 것을 확인함
- [x] **ASS(Advanced SubStation Alpha) 자막 내보내기** — SRT는 폰트 크기를 지정할 수 없어(플레이어가 대부분 무시), 줄마다 실제로 다른 폰트 크기/색상을 지정할 수 있는 ASS 형식을 추가 지원. 현재 줄은 `style.highlightColor` + 지정 크기, 다음 줄 미리보기는 `style.upcomingColor` + (지정 크기 - 델타, 기본 1pt 작게)로 자동 스타일링됨. Aegisub/VLC/mpv에서 스타일 그대로 재생되며 ffmpeg로 영상에 직접 번인(burn-in)할 수도 있음. **단, CapCut은 ASS 파일 자체를 지원하지 않으므로**(SRT/TXT만 지원) CapCut에서는 위의 SRT 2파일(현재 줄/다음 줄) 내보내기를 사용할 것
- [x] 자막 색상(기본/강조/다음줄/배경) 및 글자 크기 커스터마이즈

검증 방법: 헤드리스 브라우저(Playwright)로 실제 앱을 구동해 가사 입력 → 오디오 업로드 → 자동 정렬(에너지 휴리스틱 + 실제 음성인식 정렬 서버 양쪽) → 파형 리전 드래그 수정 → 수동 탭 타이밍 → 프로젝트 저장까지 전체 플로우를 실행했고, 콘솔 에러 없이 정상 동작함을 확인했습니다.

## 아직 구현하지 못한 기능 / 알려진 제한

- **실제 정렬 서버(`alignment-server`)의 어휘 한계.** `kresnik/wav2vec2-large-xlsr-korean`의 어휘는 학습 데이터에 등장한 약 1,200여 개 한글 음절로 제한되어, 희귀 음절/신조어/외래어 표기는 [UNK] 처리되어 그 구간 정확도가 낮을 수 있습니다.
- **정렬 서버는 CPU 환경에서 느릴 수 있음.** GPU가 없으면 곡 길이에 따라 수십 초~수 분 소요될 수 있습니다(자동으로 GPU가 있으면 사용).
- 프로젝트를 다른 PC/브라우저로 옮기면 오디오 원본(IndexedDB에 저장됨)은 함께 옮겨지지 않습니다. `.json`에는 파일명/길이 등 메타데이터만 저장되며, 불러오기 시 오디오가 없으면 재업로드를 안내합니다.
- **노래방 영상은 단색/투명 배경 위 자막만 렌더링합니다.** 실제 뮤직비디오/이미지를 배경으로 직접 합성하는 기능은 없습니다(영상 편집 프로그램에서 mp4/WebM을 오버레이로 얹는 방식을 권장 — 투명 WebM은 CapCut Desktop 등에서 바로 오버레이로 사용 가능).
- mp4 렌더링은 줄 안의 **모든** 음절에 타이밍이 있어야 그 줄을 포함합니다(부분 타이밍은 `\kf` 합이 어긋나 제외).
- 되돌리기(Undo)는 수동 탭 입력에 한정되며, 드래그로 수정한 타이밍이나 가사 수정에 대한 범용 Undo/Redo는 없습니다.
- 다중 사용자/자동 저장(auto-save)은 없고, 저장은 수동 다운로드 방식입니다.

## 다음 단계 제안

1. **정렬 서버 배포 편의성 개선** — 매번 수동으로 `uvicorn`을 띄우는 대신, 프론트엔드에서 서버 미실행을 감지하면 실행 방법을 안내하는 등 UX 개선. 필요하면 PyInstaller 등으로 실행 파일화 검토.
2. **정렬 정확도 개선** — 어휘에 없는 음절(OOV) 비율이 높은 가사를 위해 자모 단위 CTC 모델 병행 지원, 또는 Montreal Forced Aligner 어댑터 추가 검토.
3. **mp4 배경 커스터마이즈** — 단색 대신 이미지/영상을 배경으로 합성하는 옵션.
4. **범용 Undo/Redo** — 프로젝트 상태 전체에 대한 히스토리 스택
5. **오디오 파일 자체를 프로젝트 파일에 임베드하는 옵션** (base64, 이식성 ↑ 대신 파일 크기 ↑) 또는 `.zip` 번들 저장
6. **가사 줄 자동 개행/타임코드 프리셋(.lrc 등) 가져오기/내보내기**
