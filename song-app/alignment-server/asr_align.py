"""한국어 wav2vec2 CTC 모델 로딩 및 타겟 토큰 시퀀스 구성 유틸리티."""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Tuple

import torch
from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor

logger = logging.getLogger("alignment-server")

MODEL_NAME = "kresnik/wav2vec2-large-xlsr-korean"

_processor: Optional[Wav2Vec2Processor] = None
_model: Optional[Wav2Vec2ForCTC] = None
_device: Optional[torch.device] = None


def get_device() -> torch.device:
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


def load_asr_model() -> Tuple[Wav2Vec2Processor, Wav2Vec2ForCTC, torch.device]:
    global _processor, _model, _device
    if _model is None:
        logger.info("Loading ASR model %s ...", MODEL_NAME)
        device = get_device()
        _processor = Wav2Vec2Processor.from_pretrained(MODEL_NAME)
        model = Wav2Vec2ForCTC.from_pretrained(MODEL_NAME)
        model.eval()
        model.to(device)
        _model = model
        _device = device
        logger.info("ASR model loaded on %s", device)
    return _processor, _model, _device  # type: ignore[return-value]


def _find_delimiter_id(processor: Wav2Vec2Processor, vocab: Dict[str, int]) -> int:
    tokenizer = processor.tokenizer
    candidates = []
    word_delim = getattr(tokenizer, "word_delimiter_token", None)
    if word_delim:
        candidates.append(word_delim)
    candidates.extend(["|", " "])
    for cand in candidates:
        if cand in vocab:
            return vocab[cand]
    unk = tokenizer.unk_token
    return vocab.get(unk, 0)


def build_target_and_mapping(
    processor: Wav2Vec2Processor,
    tokens: List,
) -> Tuple[List[int], List[Optional[str]], List[str]]:
    """
    tokens: [{type: 'syllable'|'delimiter', id?, char?}, ...] (pydantic 모델 리스트)
    반환: (target_ids, mapping, warnings)
      - mapping[i]는 target_ids[i]에 대응하는 프론트엔드 syllable id (delimiter면 None)
    """
    tokenizer = processor.tokenizer
    vocab: Dict[str, int] = tokenizer.get_vocab()
    unk_id = vocab.get(tokenizer.unk_token, 0)
    delimiter_id = _find_delimiter_id(processor, vocab)

    target_ids: List[int] = []
    mapping: List[Optional[str]] = []
    warnings: List[str] = []
    oov_chars: set[str] = set()

    for tok in tokens:
        if tok.type == "delimiter":
            target_ids.append(delimiter_id)
            mapping.append(None)
        else:
            char = tok.char or ""
            tid = vocab.get(char, unk_id)
            if char not in vocab:
                oov_chars.add(char)
            target_ids.append(tid)
            mapping.append(tok.id)

    if oov_chars:
        sample = ", ".join(list(oov_chars)[:10])
        warnings.append(
            f"다음 음절은 모델 어휘에 없어 정확도가 낮을 수 있습니다: {sample}"
        )

    return target_ids, mapping, warnings
