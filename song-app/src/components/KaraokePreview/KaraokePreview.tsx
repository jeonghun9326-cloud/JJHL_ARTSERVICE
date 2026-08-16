import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useProjectStore } from '../../store/useProjectStore'
import type { LyricLine, Syllable, SubtitleStyle } from '../../types/project'

function findActiveLineIndex(lines: LyricLine[], t: number): number {
  let active = -1
  for (const line of lines) {
    const timed = line.syllables.filter((s) => s.start !== null)
    if (timed.length === 0) continue
    const firstStart = timed[0].start as number
    if (firstStart <= t) {
      active = line.lineIndex
    } else {
      break
    }
  }
  return active
}

function nextNonEmptyLine(lines: LyricLine[], afterIndex: number): LyricLine | undefined {
  return lines.find((l) => l.lineIndex > afterIndex && l.syllables.length > 0)
}

function firstNonEmptyLine(lines: LyricLine[]): LyricLine | undefined {
  return lines.find((l) => l.syllables.length > 0)
}

function syllableFillStyle(syl: Syllable, t: number, style: SubtitleStyle): CSSProperties {
  if (syl.start === null) {
    return { color: style.baseColor }
  }
  const end = syl.end ?? syl.start + 0.001
  let progress: number
  if (t <= syl.start) progress = 0
  else if (t >= end) progress = 1
  else progress = (t - syl.start) / Math.max(end - syl.start, 0.001)

  const pct = Math.round(progress * 1000) / 10
  return {
    backgroundImage: `linear-gradient(90deg, ${style.highlightColor} ${pct}%, ${style.baseColor} ${pct}%)`,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent',
    display: 'inline-block',
    whiteSpace: 'pre',
  }
}

export default function KaraokePreview() {
  const lines = useProjectStore((s) => s.project.lines)
  const style = useProjectStore((s) => s.project.style)
  const wavesurfer = useProjectStore((s) => s.wavesurfer)
  const [t, setT] = useState(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    function loop() {
      const ws = useProjectStore.getState().wavesurfer
      if (ws) setT(ws.getCurrentTime())
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  const activeIndex = findActiveLineIndex(lines, t)
  const currentLine = activeIndex >= 0 ? lines[activeIndex] : firstNonEmptyLine(lines)
  const isUpcoming = activeIndex < 0
  const nextLine = currentLine ? nextNonEmptyLine(lines, currentLine.lineIndex) : undefined

  return (
    <div
      className="flex h-full min-h-[320px] flex-col items-center justify-center gap-6 rounded-lg border border-base-700 p-8 text-center"
      style={{ backgroundColor: style.backgroundColor, fontFamily: style.fontFamily }}
    >
      {!wavesurfer && <p className="text-sm text-gray-500">오디오를 업로드하고 재생하면 미리보기가 표시됩니다.</p>}

      {currentLine ? (
        <div
          className="font-bold leading-relaxed"
          style={{ fontSize: style.fontSize, opacity: isUpcoming ? 0.55 : 1 }}
        >
          {currentLine.syllables.length === 0 && ' '}
          {currentLine.syllables.map((syl) => (
            <span key={syl.id} style={isUpcoming ? { color: style.baseColor } : syllableFillStyle(syl, t, style)}>
              {syl.text}
              {syl.trailingSpace ? ' ' : ''}
            </span>
          ))}
        </div>
      ) : (
        <div className="text-gray-500" style={{ fontSize: style.fontSize * 0.5 }}>
          가사를 입력해주세요
        </div>
      )}

      <div
        className="leading-relaxed"
        style={{ fontSize: style.fontSize * 0.55, color: style.upcomingColor }}
      >
        {nextLine ? nextLine.syllables.map((s) => s.text + (s.trailingSpace ? ' ' : '')).join('') : ' '}
      </div>
    </div>
  )
}
