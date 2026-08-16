"""
로컬 한국어 음성인식(wav2vec2 CTC) 기반 Forced Alignment 서버.

프론트엔드의 AlignmentService 인터페이스(RemoteAlignmentService)가 이 서버의 /align 엔드포인트를
호출한다. 무료/오픈소스 모델만 사용하며, 완전히 로컬에서 동작한다(외부 유료 API 없음).

핵심 아이디어:
1. 사용자가 입력한 가사(음절 순서)를 "노래 부르는 순서" 그대로 토큰 시퀀스로 받는다.
2. (선택) Hybrid Demucs로 보컬만 분리해 반주 간섭을 줄인다.
3. 한국어 wav2vec2 CTC 모델로 프레임 단위 로그확률(emission)을 계산한다.
4. torchaudio.functional.forced_align으로 "이미 정해진 가사 순서"를 오디오에 강제 정렬한다.
5. 프레임 단위 결과를 음절 단위 시작/종료 시간으로 변환해 반환한다.

주의: 이 모델의 어휘(vocab)는 학습 데이터에 등장한 한글 음절들로 구성되어 있어 모든 음절을
포함하지는 않는다. 어휘에 없는 음절은 [UNK]로 처리되며 해당 구간의 타이밍 정확도가 떨어질 수 있다.
"""

from __future__ import annotations

import io
import json
import logging
from typing import List, Literal, Optional

import soundfile as sf
import torch
import torchaudio
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

from asr_align import (
    build_target_and_mapping,
    load_asr_model,
    get_device,
)
from vocal_separation import separate_vocals
from video_render import render_karaoke_video

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("alignment-server")

MODEL_NAME = "kresnik/wav2vec2-large-xlsr-korean"
TARGET_SAMPLE_RATE = 16000

app = FastAPI(title="Karaoke Forced Alignment Server")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class AlignmentTokenIn(BaseModel):
    type: Literal["syllable", "delimiter"]
    id: Optional[str] = None
    char: Optional[str] = None


class AlignmentResultOut(BaseModel):
    syllableId: str
    start: float
    end: float


class AlignResponse(BaseModel):
    results: List[AlignmentResultOut]
    engine: str
    usedVocalSeparation: bool
    warnings: List[str] = []


@app.get("/health")
def health():
    return {"status": "ok", "device": str(get_device())}


@app.post("/align", response_model=AlignResponse)
async def align(
    audio: UploadFile = File(...),
    tokens: str = Form(...),
    separate_vocals_flag: bool = Form(False, alias="separate_vocals"),
):
    try:
        raw_tokens = json.loads(tokens)
        token_list = [AlignmentTokenIn(**t) for t in raw_tokens]
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"tokens 파싱 오류: {e}") from e

    syllable_tokens = [t for t in token_list if t.type == "syllable"]
    if not syllable_tokens:
        return AlignResponse(results=[], engine=MODEL_NAME, usedVocalSeparation=False)

    raw_bytes = await audio.read()
    try:
        data, sr = sf.read(io.BytesIO(raw_bytes), dtype="float32", always_2d=True)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"오디오 디코딩 실패: {e}") from e

    waveform = torch.from_numpy(data.T)  # (channels, samples)

    warnings: List[str] = []
    used_separation = False
    if separate_vocals_flag:
        try:
            waveform_mono = separate_vocals(waveform, sr)
            used_separation = True
        except Exception as e:  # noqa: BLE001
            logger.exception("vocal separation failed, falling back to original audio")
            warnings.append(f"보컬 분리에 실패해 원본 오디오로 진행합니다: {e}")
            waveform_mono = waveform.mean(dim=0, keepdim=True)
    else:
        waveform_mono = waveform.mean(dim=0, keepdim=True)

    if sr != TARGET_SAMPLE_RATE:
        waveform_mono = torchaudio.functional.resample(waveform_mono, sr, TARGET_SAMPLE_RATE)

    processor, model, device = load_asr_model()

    input_values = processor(
        waveform_mono.squeeze(0).numpy(),
        sampling_rate=TARGET_SAMPLE_RATE,
        return_tensors="pt",
    ).input_values.to(device)

    with torch.no_grad():
        logits = model(input_values).logits  # (1, frames, vocab)
        log_probs = torch.log_softmax(logits, dim=-1)

    blank_id = model.config.pad_token_id if model.config.pad_token_id is not None else 0

    target_ids, mapping, vocab_warnings = build_target_and_mapping(processor, token_list)
    warnings.extend(vocab_warnings)

    if len(target_ids) == 0:
        return AlignResponse(results=[], engine=MODEL_NAME, usedVocalSeparation=used_separation, warnings=warnings)

    targets_tensor = torch.tensor([target_ids], dtype=torch.int32, device=device)

    try:
        alignment, scores = torchaudio.functional.forced_align(log_probs, targets_tensor, blank=blank_id)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, f"forced_align 실패: {e}") from e

    alignment = alignment[0].cpu()
    scores = scores[0].cpu().exp()
    token_spans = torchaudio.functional.merge_tokens(alignment, scores, blank=blank_id)

    num_frames = log_probs.size(1)
    num_samples = waveform_mono.size(1)
    ratio = num_samples / num_frames / TARGET_SAMPLE_RATE

    if len(token_spans) != len(target_ids):
        warnings.append(
            "정렬 결과 길이가 예상과 달라 일부 음절의 타이밍이 부정확할 수 있습니다."
        )

    results: List[AlignmentResultOut] = []
    for i, map_id in enumerate(mapping):
        if i >= len(token_spans):
            break
        if map_id is None:
            continue
        span = token_spans[i]
        results.append(
            AlignmentResultOut(
                syllableId=map_id,
                start=round(span.start * ratio, 4),
                end=round(span.end * ratio, 4),
            )
        )

    return AlignResponse(
        results=results,
        engine=MODEL_NAME,
        usedVocalSeparation=used_separation,
        warnings=warnings,
    )


@app.post("/render-video")
async def render_video(
    audio: UploadFile = File(...),
    ass: str = Form(...),
    duration: float = Form(...),
    background_color: str = Form("#0b0d12"),
    width: int = Form(1920),
    height: int = Form(1080),
    transparent: bool = Form(False),
):
    audio_bytes = await audio.read()
    try:
        video_bytes = await render_karaoke_video(
            audio_bytes=audio_bytes,
            ass_content=ass,
            duration_seconds=duration,
            background_color=background_color,
            width=width,
            height=height,
            transparent=transparent,
        )
    except RuntimeError as e:
        raise HTTPException(500, str(e)) from e

    if transparent:
        return Response(
            content=video_bytes,
            media_type="video/webm",
            headers={"Content-Disposition": 'attachment; filename="karaoke.webm"'},
        )
    return Response(
        content=video_bytes,
        media_type="video/mp4",
        headers={"Content-Disposition": 'attachment; filename="karaoke.mp4"'},
    )
