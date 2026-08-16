// 한글 완성형 음절(가-힣) 판별 및 가사 줄을 "노래방 음절 토큰" 단위로 분리하는 유틸리티.
// 한글은 표기 자체가 음절 블록 단위이므로, 완성형 한글 한 글자 = 한 음절로 취급한다.
// 영문/숫자/기타 문자가 연속되면 하나의 토큰으로 묶어 자연스럽게 표시한다.

const HANGUL_SYLLABLE_START = 0xac00
const HANGUL_SYLLABLE_END = 0xd7a3

export function isHangulSyllable(ch: string): boolean {
  if (!ch) return false
  const code = ch.codePointAt(0)
  if (code === undefined) return false
  return code >= HANGUL_SYLLABLE_START && code <= HANGUL_SYLLABLE_END
}

export function isWhitespace(ch: string): boolean {
  return /\s/.test(ch)
}

export interface SpacedToken {
  text: string
  /** 이 토큰 바로 뒤에 원본 텍스트에서 공백이 있었는지 (단어 사이 띄어쓰기 복원용) */
  trailingSpace: boolean
}

/**
 * 한 줄의 가사 텍스트를 노래방 음절 토큰 배열로 분리한다. 원본의 띄어쓰기 위치도 함께 기록해,
 * 나중에 화면/영상에 다시 표시할 때 단어 사이 공백을 복원할 수 있게 한다.
 * - 완성형 한글 음절: 1글자 = 1토큰
 * - 그 외 연속 문자(영문/숫자/기호 등): 묶어서 1토큰
 * - 공백/탭: 토큰 경계로만 사용하고 결과 텍스트에는 포함하지 않음(trailingSpace로만 표시)
 */
export function segmentLineToTokensWithSpacing(line: string): SpacedToken[] {
  const tokens: SpacedToken[] = []
  let buffer = ''

  const flushBuffer = () => {
    if (buffer) {
      tokens.push({ text: buffer, trailingSpace: false })
      buffer = ''
    }
  }

  for (const ch of Array.from(line)) {
    if (isWhitespace(ch)) {
      flushBuffer()
      if (tokens.length > 0) tokens[tokens.length - 1].trailingSpace = true
      continue
    }
    if (isHangulSyllable(ch)) {
      flushBuffer()
      tokens.push({ text: ch, trailingSpace: false })
    } else {
      buffer += ch
    }
  }
  flushBuffer()

  return tokens
}

/** 공백 정보 없이 토큰 텍스트만 필요한 경우를 위한 편의 함수. */
export function segmentLineToTokens(line: string): string[] {
  return segmentLineToTokensWithSpacing(line).map((t) => t.text)
}
