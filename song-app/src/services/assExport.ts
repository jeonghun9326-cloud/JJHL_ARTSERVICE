import type { LyricLine, SubtitleStyle } from '../types/project'
import { sanitizeFileName } from '../utils/fileName'
import { formatAssTime, hexColorToAss, escapeAssText } from '../utils/ass'
import { buildLineLevelSrtCues, type SrtCue } from './srtExport'

export interface AssBuildOptions {
  /** 노래방처럼 각 자막에 현재 줄 + 다음 줄(작게)을 함께 표시 */
  showNextLinePreview?: boolean
  /** 현재 줄 폰트 크기 (기본: style.fontSize) */
  fontSize?: number
  /** 다음 줄에 적용할 크기 차이. 음수면 더 작게 (기본 -1 = "한 포인트 낮게") */
  nextLineFontSizeDelta?: number
  fontName?: string
}

const DEFAULT_FONT_NAME = 'Malgun Gothic'

export interface AssExportSummary {
  exportedLineCount: number
  skippedLineCount: number
}

function buildAssHeader(fontName: string, fontSize: number, primaryColorAss: string): string {
  return `[Script Info]
Title: Karaoke Subtitle Export
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: 1920
PlayResY: 1080
YCbCr Matrix: TV.601

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${primaryColorAss},&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,60,60,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`
}

/** SrtCue 목록으로부터 .ass(Advanced SubStation Alpha) 자막 내용을 만든다. 줄마다 다른 폰트 크기/색상을 지정할 수 있다. */
export function serializeAss(cues: SrtCue[], style: SubtitleStyle, options: AssBuildOptions = {}): string {
  const {
    showNextLinePreview = true,
    fontSize = style.fontSize,
    nextLineFontSizeDelta = -1,
    fontName = DEFAULT_FONT_NAME,
  } = options

  const nextFontSize = Math.max(1, fontSize + nextLineFontSizeDelta)
  const primaryColorAss = hexColorToAss(style.highlightColor)
  const secondaryColorAss = hexColorToAss(style.upcomingColor)

  const events = cues
    .map((cue, i) => {
      const parts = [`{\\fs${fontSize}\\c${primaryColorAss}}${escapeAssText(cue.text)}`]
      if (showNextLinePreview) {
        const nextText = cues[i + 1]?.text
        if (nextText) {
          parts.push(`{\\fs${nextFontSize}\\c${secondaryColorAss}}${escapeAssText(nextText)}`)
        }
      }
      const text = parts.join('\\N')
      return `Dialogue: 0,${formatAssTime(cue.start)},${formatAssTime(cue.end)},Default,,0,0,0,,${text}`
    })
    .join('\n')

  return buildAssHeader(fontName, fontSize, primaryColorAss) + events + '\n'
}

/** 줄 단위 ASS 자막 파일을 다운로드한다. SRT와 달리 줄마다 다른 폰트 크기/색상을 실제로 지정할 수 있다. */
export function downloadLineLevelAss(
  lines: LyricLine[],
  style: SubtitleStyle,
  projectName: string,
  options: AssBuildOptions = {},
): AssExportSummary {
  const nonEmptyLineCount = lines.filter((l) => l.rawText.trim().length > 0).length
  const cues = buildLineLevelSrtCues(lines)
  const assText = serializeAss(cues, style, options)

  const blob = new Blob([assText], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${sanitizeFileName(projectName, 'lyrics')}.ass`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)

  return {
    exportedLineCount: cues.length,
    skippedLineCount: nonEmptyLineCount - cues.length,
  }
}
