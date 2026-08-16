import type { LyricLine } from '../../types/project'
import { segmentLineToTokens } from '../../utils/hangul'

export type AlignmentToken =
  | { type: 'syllable'; id: string; char: string }
  | { type: 'delimiter' }

/**
 * 정렬 서버로 보낼 "노래 부르는 순서" 토큰 시퀀스를 만든다.
 * 원본 가사의 띄어쓰기(단어 경계)와 줄바꿈을 delimiter로 보존해, 음성인식 모델이
 * 학습 시 접했던 자연스러운 발화 경계(공백/쉼)에 최대한 가깝게 정렬하도록 돕는다.
 */
export function buildAlignmentTokenSequence(lines: LyricLine[]): AlignmentToken[] {
  const tokens: AlignmentToken[] = []
  let hasEmittedLine = false

  for (const line of lines) {
    if (line.syllables.length === 0) continue
    if (hasEmittedLine) tokens.push({ type: 'delimiter' })
    hasEmittedLine = true

    const words = line.rawText.split(/\s+/).filter((w) => w.length > 0)
    let syllableCursor = 0
    words.forEach((word, wordIdx) => {
      if (wordIdx > 0) tokens.push({ type: 'delimiter' })
      const wordTokenTexts = segmentLineToTokens(word)
      for (const text of wordTokenTexts) {
        const syl = line.syllables[syllableCursor]
        if (syl) {
          tokens.push({ type: 'syllable', id: syl.id, char: text })
        }
        syllableCursor++
      }
    })
  }

  return tokens
}
