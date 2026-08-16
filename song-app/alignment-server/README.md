# Alignment Server (실험적, 선택 기능)

로컬 Python 서버로 두 가지 선택 기능을 제공합니다.

1. 한국어 wav2vec2 CTC 음성인식 모델로 가사와 보컬을 실제로 정렬(Forced Alignment)
2. 음절 타이밍 + ffmpeg로 노래방 스타일 mp4 영상 렌더링

**이 서버는 선택 사항입니다.** 켜지 않아도 메인 앱(파형 에너지 휴리스틱 정렬, 수동 타이밍,
드래그 수정, SRT/ASS 내보내기 등)은 정상적으로 동작합니다. 실제 음성인식 정렬이나 mp4
영상 내보내기가 필요할 때만 실행하세요.

## 실행 방법 (Windows)

```bash
cd alignment-server
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

첫 실행 시 Hugging Face에서 한국어 음성인식 모델(`kresnik/wav2vec2-large-xlsr-korean`,
약 1.2GB)을 자동으로 다운로드합니다. 이후에는 로컬 캐시(`~/.cache/huggingface`)를 사용합니다.

서버가 뜨면 프론트엔드(`npm run dev`)의 "자동 타이밍 추정" 영역에서 엔진을
**"로컬 AI 음성인식 정렬"** 로 바꾸면 이 서버를 사용합니다.

## 동작 원리

1. 프론트엔드가 가사를 "노래 부르는 순서" 토큰 시퀀스(음절 + 단어/줄 구분자)로 변환해 전송
2. (선택) `torchaudio`에 내장된 Hybrid Demucs로 보컬만 분리 — 반주 간섭을 줄여 인식 정확도 향상
3. 한국어 wav2vec2 CTC 모델로 프레임 단위 로그확률 계산
4. `torchaudio.functional.forced_align`으로 "이미 정해진 가사 순서"를 오디오에 강제 정렬
   (자유 인식이 아니라, 사용자가 입력한 정답 텍스트를 오디오 시간축에 맞추는 것)
5. 프레임 결과를 음절 단위 시작/종료 시간으로 변환해 반환

## API

### `GET /health`
```json
{ "status": "ok", "device": "cpu" }
```

### `POST /align` (multipart/form-data)
- `audio`: 오디오 파일 (wav 등)
- `tokens`: JSON 문자열, 예:
  ```json
  [
    { "type": "syllable", "id": "L0-S0", "char": "가" },
    { "type": "syllable", "id": "L0-S1", "char": "끔" },
    { "type": "delimiter" },
    { "type": "syllable", "id": "L0-S2", "char": "은" }
  ]
  ```
- `separate_vocals`: `"true"` / `"false"`

응답:
```json
{
  "results": [{ "syllableId": "L0-S0", "start": 0.12, "end": 0.34 }, ...],
  "engine": "kresnik/wav2vec2-large-xlsr-korean",
  "usedVocalSeparation": false,
  "warnings": []
}
```

### `POST /render-video` (multipart/form-data)
음절 단위 `\kf`(karaoke fill) 태그가 포함된 ASS 자막(프론트엔드 `karaokeVideoExport.ts`가 생성)과
오디오를 받아, 노래방 좌→우 채우기 자막을 구운 영상을 반환한다.
내부적으로 시스템에 설치된 `ffmpeg`를 subprocess로 호출한다.

- `audio`: 오디오 파일
- `ass`: `\kf` 태그가 포함된 ASS 자막 전체 텍스트
- `duration`: 영상 길이(초), 보통 오디오 전체 길이
- `background_color`: 배경색 hex (기본 `#0b0d12`, `transparent=true`면 무시됨)
- `width`, `height`: 해상도 (기본 1920x1080)
- `transparent`: `"true"`면 배경 없이 텍스트만 담은 투명 WebM으로 반환 (기본 `"false"` = 단색 배경 mp4)

응답: `transparent=false`면 `video/mp4`, `transparent=true`면 `video/webm` 바이너리.

**투명 배경(WebM) 구현 방식**: mp4/H.264는 알파 채널(투명도)을 지원하지 않아 mp4로는 완전한 투명
영상을 만들 수 없다. WebM은 VP9 코덱 + `yuva420p` 픽셀 포맷으로 알파 채널을 지원하지만, ffmpeg의
`ass` 필터가 알파 채널을 직접 다루지 못해(투명 배경에 자막을 그리면 텍스트까지 통째로 투명해짐,
실측 확인) 다음과 같은 2단계 방식을 쓴다:
1. 자막과 거의 겹치지 않을 크로마키 녹색(`#0dff0d`) 배경 위에 `ass` 필터로 정상적으로 자막을 그린다.
2. `colorkey` 필터로 그 배경색만 제거해 투명하게 만든 뒤, `libvpx-vp9 -pix_fmt yuva420p -auto-alt-ref 0`로
   인코딩한다.

주의: 자막 색상(강조/기본/다음줄 색)이 크로마키 색과 매우 비슷하면 그 부분도 함께 투명해질 수 있다.
또한 WebM의 VP9 알파는 컨테이너의 별도 블록(BlockAdditional)에 저장되므로, `ffmpeg -i`로 직접
디코드해 확인하려면 `-vcodec libvpx-vp9`를 명시해야 한다(기본 디코더 선택으로는 알파가 병합되지
않음). 브라우저(`<video>`)나 CapCut 같은 실제 재생기는 이 문제 없이 정상적으로 투명하게 재생한다.

**ffmpeg 필요**: 시스템에 `ffmpeg`가 설치되어 PATH에 있어야 하며, `libx264`/`aac`, `libvpx-vp9`/`libopus`
인코더와 `libass`(자막 렌더링) 지원이 포함된 빌드여야 합니다. (Windows: `winget install Gyan.FFmpeg` 등)

## 알려진 제한

- 모델 어휘(vocab)는 학습 데이터에 등장한 한글 음절(약 1,200여 개)로 제한되어 있어, 희귀한
  음절/신조어/외래어 표기는 [UNK]로 처리되어 해당 구간 정확도가 떨어질 수 있습니다.
- CPU만 있는 PC에서는 곡 길이에 따라 정렬에 수십 초~수 분이 걸릴 수 있습니다(GPU가 있으면
  자동으로 사용합니다).
- 보컬 분리(Demucs)는 15초 단위로 나누어 처리하며 경계에서 미세한 클릭음이 생길 수 있지만,
  이는 최종 출력이 아니라 음성인식 전처리용이므로 정렬 품질에는 큰 영향이 없습니다.
