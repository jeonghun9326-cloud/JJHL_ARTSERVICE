import type { LyricLine } from '../../types/project'
import type { AlignmentTimingResult } from '../AlignmentService'
import { flattenSyllables } from '../lyricsParser'

const DEFAULT_MAX_GAP_SECONDS = 2

/**
 * Forced Alignment(CTC) 결과는 각 음절의 "실제로 인식된 핵심 구간"만 아주 짧게 반환하는 경우가 많아
 * (예: 20ms), 다음 음절 시작 전까지 빈 간격이 생긴다. 이 상태로는 노래방 미리보기에서 강조색이
 * 순간적으로만 반짝이고, 파형에서도 음절 블록이 너무 얇아 드래그로 수정하기 어렵다.
 * 다음 음절 시작 시각까지 end를 늘려 간격을 메운다 (지나치게 큰 간격은 오정렬일 수 있으므로 확장하지 않음).
 */
export function extendSyllableEndsToNextStart(
  results: AlignmentTimingResult[],
  lines: LyricLine[],
  maxGapSeconds = DEFAULT_MAX_GAP_SECONDS,
): AlignmentTimingResult[] {
  const order = flattenSyllables(lines).map((s) => s.id)
  const byId = new Map(results.map((r) => [r.syllableId, { ...r }]))

  for (let i = 0; i < order.length - 1; i++) {
    const cur = byId.get(order[i])
    const next = byId.get(order[i + 1])
    if (!cur || !next) continue
    const gap = next.start - cur.end
    if (gap > 0 && gap <= maxGapSeconds) {
      cur.end = next.start
    }
  }

  return Array.from(byId.values())
}
