import type { LyricLine } from '../types/project'

export interface AlignmentTimingResult {
  syllableId: string
  start: number
  end: number
}

export interface AlignmentProgress {
  ratio: number // 0..1
  message?: string
}

/**
 * 보컬 오디오와 가사를 입력받아 음절별 타이밍을 추정하는 서비스의 공통 인터페이스.
 *
 * 이 인터페이스를 분리해 둔 이유:
 * MVP 단계에서는 정확한 한국어 Forced Alignment(음소/음절 단위 강제 정렬)를 구현하기 어렵다.
 * 대신 여기서는 파형 에너지 기반의 휴리스틱 스텁(EnergyBasedAlignmentService)을 제공하고,
 * 추후 아래와 같은 실제 정렬 엔진으로 손쉽게 교체할 수 있도록 계약(contract)만 고정해 둔다.
 *
 * 교체 후보 (추후 별도 로컬 서비스/프로세스로 연동 예정):
 * - Montreal Forced Aligner (한국어 사전/음향모델 필요)
 * - 한국어 wav2vec2 CTC 기반 forced-align (torchaudio.functional.forced_align)
 * - NVIDIA NeMo Forced Aligner
 *
 * 실제 엔진은 대개 Python/ML 런타임이 필요하므로, 로컬 백엔드 프로세스(HTTP API)로 띄우고
 * 이 인터페이스를 구현하는 어댑터를 추가하는 방식으로 연결하면 된다.
 *
 * 과거에 이런 어댑터(RemoteAlignmentService, wav2vec2 CTC 기반)가 실제로 있었지만,
 * 그 서버는 항상 "방문자 자신의 PC"에서 실행돼야 해서 배포된 사이트에서는 서버를 실행한
 * 사람 본인 외에는 아무도 쓸 수 없었다 — 그래서 제거했다. 여러 사용자가 함께 쓰려면
 * 이런 어댑터를 다시 추가하기 전에 서버를 공개적으로(항상 켜져 있는 호스트에) 올려야 한다.
 */
export interface AlignmentService {
  readonly id: string
  readonly displayName: string
  /** 실제 강제 정렬(음소 인식 기반)인지, 휴리스틱 추정인지 */
  readonly isForcedAlignment: boolean

  align(
    audioBuffer: AudioBuffer,
    lines: LyricLine[],
    onProgress?: (progress: AlignmentProgress) => void,
  ): Promise<AlignmentTimingResult[]>
}
