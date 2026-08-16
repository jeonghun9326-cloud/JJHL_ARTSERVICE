"""Hybrid Demucs(torchaudio 내장 사전학습 모델)를 이용한 보컬 분리.

반주가 섞인 원곡에서 보컬만 추출해 wav2vec2 CTC 정렬 정확도를 높이기 위한 전처리 단계.
메모리 문제를 피하기 위해 오디오를 청크 단위로 나눠 처리한다(경계에서 미세한 클릭음이
있을 수 있으나, 최종 출력 영상이 아니라 음성인식 전처리용이므로 음질보다 견고함을 우선했다).
"""

from __future__ import annotations

import logging
from typing import Optional

import torch
import torchaudio

logger = logging.getLogger("alignment-server")

_demucs_model = None
_demucs_sample_rate: Optional[int] = None


def get_device() -> torch.device:
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


def load_demucs_model():
    global _demucs_model, _demucs_sample_rate
    if _demucs_model is None:
        logger.info("Loading HDEMUCS vocal separation model ...")
        bundle = torchaudio.pipelines.HDEMUCS_HIGH_MUSDB_PLUS
        model = bundle.get_model()
        model.eval()
        model.to(get_device())
        _demucs_model = model
        _demucs_sample_rate = bundle.sample_rate
        logger.info("Demucs model loaded (sample_rate=%s)", _demucs_sample_rate)
    return _demucs_model, _demucs_sample_rate


def separate_vocals(waveform: torch.Tensor, sample_rate: int) -> torch.Tensor:
    """waveform: (channels, samples) float32, range roughly [-1, 1].
    반환: (1, samples) 모노 보컬 파형, 원래 sample_rate 기준."""
    model, model_sr = load_demucs_model()
    device = get_device()

    if waveform.size(0) == 1:
        stereo = waveform.repeat(2, 1)
    else:
        stereo = waveform[:2]

    if sample_rate != model_sr:
        stereo = torchaudio.functional.resample(stereo, sample_rate, model_sr)

    sources_order = list(getattr(model, "sources", ["drums", "bass", "other", "vocals"]))
    vocals_idx = sources_order.index("vocals")

    chunk_len = model_sr * 15  # 15초 단위 청크 (메모리 사용량 제한)
    total_len = stereo.size(1)
    vocal_chunks = []

    with torch.no_grad():
        pos = 0
        while pos < total_len:
            end = min(pos + chunk_len, total_len)
            chunk = stereo[:, pos:end].to(device)
            pad_amount = chunk_len - chunk.size(1)
            if pad_amount > 0:
                chunk = torch.nn.functional.pad(chunk, (0, pad_amount))
            sources = model(chunk.unsqueeze(0))[0]  # (num_sources, 2, chunk_len)
            vocals_chunk = sources[vocals_idx].detach().cpu()[:, : end - pos]
            vocal_chunks.append(vocals_chunk)
            pos = end

    vocals = torch.cat(vocal_chunks, dim=1) if vocal_chunks else torch.zeros(2, 0)
    mono = vocals.mean(dim=0, keepdim=True)

    if model_sr != sample_rate:
        mono = torchaudio.functional.resample(mono, model_sr, sample_rate)

    return mono
