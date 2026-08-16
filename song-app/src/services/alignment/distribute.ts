import type { Syllable } from '../../types/project'
import type { AlignmentTimingResult } from '../AlignmentService'

/** 토큰의 "무게"(예상 발음 길이 비중). 한글 음절 1자=1, 영문/숫자 묶음=글자수 */
export function tokenWeight(text: string): number {
  return Math.max(1, Array.from(text).length)
}

/**
 * 주어진 음절들을 [start, end] 구간 안에 글자수(tokenWeight) 비례로 순서대로 배분한다.
 * 파형 에너지 자동 정렬과 SRT 임포트가 이 로직을 공유한다 — 정렬 대상 구간이
 * "발성 감지 구간 전체"냐 "SRT 큐 하나"냐만 다를 뿐, 구간 안에서 나누는 방식은 같다.
 */
export function distributeSyllablesInRange(
  syllables: Syllable[],
  start: number,
  end: number,
): AlignmentTimingResult[] {
  const duration = Math.max(end - start, 0.01)
  const totalWeight = syllables.reduce((sum, s) => sum + tokenWeight(s.text), 0)
  if (totalWeight === 0) return []

  const results: AlignmentTimingResult[] = []
  let cursor = start
  for (const syl of syllables) {
    const weight = tokenWeight(syl.text)
    const segDuration = (weight / totalWeight) * duration
    const segStart = cursor
    const segEnd = Math.min(end, segStart + segDuration)
    results.push({ syllableId: syl.id, start: segStart, end: Math.max(segEnd, segStart + 0.01) })
    cursor = segEnd
  }
  return results
}
