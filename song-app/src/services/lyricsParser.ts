import type { LyricLine, Syllable } from '../types/project'
import { segmentLineToTokensWithSpacing } from '../utils/hangul'

export function makeSyllableId(lineIndex: number, syllableIndex: number): string {
  return `L${lineIndex}-S${syllableIndex}`
}

/**
 * 가사 원문 전체를 줄바꿈 구조를 유지한 채 LyricLine[]으로 변환한다.
 * 줄바꿈은 그대로 lineIndex 경계로 사용하고, 빈 줄도 구조 유지를 위해 보존한다
 * (단, 빈 줄에는 음절이 없으므로 타이밍 대상에서 자연히 제외된다).
 */
export function parseLyrics(rawText: string): LyricLine[] {
  const rawLines = rawText.split('\n')

  return rawLines.map((rawLineText, lineIndex) => {
    const tokens = segmentLineToTokensWithSpacing(rawLineText)
    const syllables: Syllable[] = tokens.map(({ text, trailingSpace }, syllableIndex) => ({
      id: makeSyllableId(lineIndex, syllableIndex),
      text,
      start: null,
      end: null,
      lineIndex,
      syllableIndex,
      trailingSpace,
    }))
    return { lineIndex, rawText: rawLineText, syllables }
  })
}

/**
 * 가사가 수정되었을 때, 기존에 입력된 타이밍 값을 최대한 보존하며 재파싱한다.
 * 같은 lineIndex/syllableIndex/text 조합이면 동일 음절로 간주하고 타이밍을 이어받는다.
 */
export function reparseLyricsPreservingTimings(
  rawText: string,
  previousLines: LyricLine[],
): LyricLine[] {
  const newLines = parseLyrics(rawText)

  const previousById = new Map<string, Syllable>()
  for (const line of previousLines) {
    for (const syl of line.syllables) {
      previousById.set(syl.id, syl)
    }
  }

  for (const line of newLines) {
    for (const syl of line.syllables) {
      const prev = previousById.get(syl.id)
      if (prev && prev.text === syl.text) {
        syl.start = prev.start
        syl.end = prev.end
      }
    }
  }

  return newLines
}

/** 전체 프로젝트에서 순서대로 모든 음절을 1차원 배열로 펼친다 (수동 탭 입력, 정렬 등에 사용). */
export function flattenSyllables(lines: LyricLine[]): Syllable[] {
  return lines.flatMap((line) => line.syllables)
}
