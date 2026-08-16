import type { LyricLine } from '../types/project'
import { sanitizeFileName } from '../utils/fileName'

export interface SrtCue {
  index: number
  start: number
  end: number
  text: string
}

const MIN_CUE_DURATION = 0.3
const GAP_BETWEEN_CUES = 0.01

function pad(n: number, len: number): string {
  return String(n).padStart(len, '0')
}

function formatSrtTime(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000))
  const h = Math.floor(totalMs / 3_600_000)
  const m = Math.floor((totalMs % 3_600_000) / 60_000)
  const s = Math.floor((totalMs % 60_000) / 1000)
  const ms = totalMs % 1000
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`
}

/**
 * 가사 줄 단위로 SRT 자막 큐를 만든다. 줄의 시작 시간은 그 줄에 속한 음절들 중 타이밍이
 * 입력된 음절들의 최소 시작 시간으로 계산한다(음절 전부가 아니라 일부만 타이밍이 있어도
 * 사용 가능). 타이밍이 하나도 없는 줄은 건너뛴다.
 *
 * 종료 시간은 그 줄이 실제로 불린 마지막 음절 시각이 아니라, 다음 줄이 시작되기 직전까지로
 * 늘린다 — 그렇지 않으면 줄 사이의 짧은 호흡/간주 구간마다 자막이 사라졌다가 다시 나타나
 * 깜빡이는 것처럼 보여 읽기 불편하다(라이브 미리보기 화면은 원래 이렇게 끊김 없이 표시된다).
 */
export function buildLineLevelSrtCues(lines: LyricLine[]): SrtCue[] {
  const cues: SrtCue[] = []

  for (const line of lines) {
    const text = line.rawText.trim()
    if (!text) continue

    const timed = line.syllables.filter(
      (s): s is typeof s & { start: number; end: number } => s.start !== null && s.end !== null,
    )
    if (timed.length === 0) continue

    const start = Math.min(...timed.map((s) => s.start))
    const end = Math.max(...timed.map((s) => s.end))

    cues.push({ index: cues.length + 1, start, end: Math.max(end, start + MIN_CUE_DURATION), text })
  }

  for (let i = 0; i < cues.length - 1; i++) {
    cues[i].end = Math.max(cues[i].start + 0.05, cues[i + 1].start - GAP_BETWEEN_CUES)
  }

  return cues
}

/**
 * "다음 줄 미리보기" 큐를 만든다. 현재 줄과 같은 시간대에, 다음 줄의 텍스트를 담은 별도 트랙용 큐.
 * CapCut처럼 자막 파일 하나당 스타일이 통째로 하나만 적용되는 편집기에서, 현재 줄 트랙과
 * 미리보기 트랙을 각각 다른 파일로 불러와 서로 다른 폰트 크기를 지정할 수 있게 해준다.
 */
export function buildPreviewLineSrtCues(currentCues: SrtCue[]): SrtCue[] {
  const previewCues: SrtCue[] = []
  for (let i = 0; i < currentCues.length; i++) {
    const nextText = currentCues[i + 1]?.text
    if (!nextText) continue
    previewCues.push({
      index: previewCues.length + 1,
      start: currentCues[i].start,
      end: currentCues[i].end,
      text: nextText,
    })
  }
  return previewCues
}

export function serializeSrt(cues: SrtCue[]): string {
  return cues
    .map((c) => `${c.index}\n${formatSrtTime(c.start)} --> ${formatSrtTime(c.end)}\n${c.text}\n`)
    .join('\n')
}

function downloadTextFile(text: string, fileName: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export interface SrtExportSummary {
  exportedLineCount: number
  skippedLineCount: number
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 줄 단위 SRT 파일을 다운로드한다. 영상 편집 프로그램(프리미어, 리졸브 등)에서 바로 불러올 수 있다.
 * includePreviewTrack이 true면, 다음 줄 미리보기를 같은 시간대의 별도 .preview.srt 파일로 함께
 * 내보낸다 — CapCut 등에서 두 트랙을 따로 불러와 각각 다른 글자 크기를 지정하면 노래방처럼
 * "현재 줄 크게 + 다음 줄 작게"를 재현할 수 있다.
 *
 * 브라우저(특히 Chrome 계열)는 한 번의 사용자 액션에서 자동으로 여러 파일을 연속 다운로드하면
 * 두 번째부터 조용히 막는 경우가 있어, 두 파일 사이에 짧은 지연을 둔다.
 */
export async function downloadLineLevelSrt(
  lines: LyricLine[],
  projectName: string,
  options: { includePreviewTrack?: boolean } = {},
): Promise<SrtExportSummary> {
  const nonEmptyLineCount = lines.filter((l) => l.rawText.trim().length > 0).length
  const cues = buildLineLevelSrtCues(lines)
  const baseName = sanitizeFileName(projectName, 'lyrics')

  downloadTextFile(serializeSrt(cues), `${baseName}.srt`)

  if (options.includePreviewTrack) {
    const previewCues = buildPreviewLineSrtCues(cues)
    await delay(400)
    downloadTextFile(serializeSrt(previewCues), `${baseName}.preview.srt`)
  }

  return {
    exportedLineCount: cues.length,
    skippedLineCount: nonEmptyLineCount - cues.length,
  }
}
