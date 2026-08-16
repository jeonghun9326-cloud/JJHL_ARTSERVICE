export interface ParsedSrtCue {
  start: number
  end: number
  text: string
}

const TIME_PATTERN = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/

function parseSrtTime(token: string): number | null {
  const m = token.match(TIME_PATTERN)
  if (!m) return null
  const [, h, mm, s, ms] = m
  return Number(h) * 3600 + Number(mm) * 60 + Number(s) + Number(ms.padEnd(3, '0')) / 1000
}

/** <i>, <b> 같은 스타일 태그와 {\an8} 같은 ASS 스타일 잔재를 제거한다. */
function stripTags(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\{[^}]*\}/g, '')
    .trim()
}

/**
 * SRT 자막 텍스트를 큐 배열로 파싱한다. 순번 줄은 있어도 없어도 되고, CRLF/LF 모두 허용한다.
 * 한 큐 안에 여러 줄의 텍스트가 있으면(2줄 자막 등) 공백으로 합쳐 한 줄로 취급한다 —
 * 이 앱의 가사 한 줄 = SRT 큐 하나 라는 전제와 맞추기 위함이다.
 * 형식을 인식하지 못하는 블록은 조용히 건너뛴다.
 */
export function parseSrt(raw: string): ParsedSrtCue[] {
  const withoutBom = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
  const normalized = withoutBom.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!normalized) return []

  const blocks = normalized.split(/\n{2,}/)
  const cues: ParsedSrtCue[] = []

  for (const block of blocks) {
    const blockLines = block.split('\n').filter((l) => l.trim().length > 0)
    if (blockLines.length === 0) continue

    let idx = 0
    if (/^\d+$/.test(blockLines[0].trim())) idx = 1
    const timeLine = blockLines[idx]
    if (!timeLine || !timeLine.includes('-->')) continue

    const [startToken, endToken] = timeLine.split('-->')
    const start = parseSrtTime(startToken)
    const end = endToken ? parseSrtTime(endToken) : null
    if (start === null || end === null) continue

    const text = blockLines
      .slice(idx + 1)
      .map(stripTags)
      .filter(Boolean)
      .join(' ')
    if (!text) continue

    cues.push({ start, end: Math.max(end, start + 0.01), text })
  }

  return cues
}
