// 브라우저 자체 녹화(Canvas + MediaRecorder)로 노래방 자막 영상을 만든다.
// 예전에는 로컬 alignment-server(ffmpeg)에 오디오+ASS를 보내 서버에서 렌더링했지만, 그 서버는
// "지금 이 페이지를 보고 있는 사람 자신의 PC"에서 실행돼야만 동작해서 배포된 사이트에서는
// 아무도 쓸 수 없었다. 여기서는 그 대신 KaraokePreview.tsx와 같은 음절 진행률 로직을 캔버스에
// 직접 그리고, canvas.captureStream() + AudioContext의 실시간 오디오를 합쳐 MediaRecorder로
// 녹화한다 — 서버 없이 방문자 누구나 쓸 수 있지만, 실시간 재생을 그대로 녹화하는 방식이라
// 곡 길이만큼 시간이 걸린다(서버 렌더링처럼 빠르게 끝나지 않음).

import type { LyricLine, Syllable, SubtitleStyle } from '../types/project'
import { getAudioContext } from './audio'
import { sanitizeFileName } from '../utils/fileName'

export interface VideoRecordOptions {
  width?: number
  height?: number
  fps?: number
  showNextLinePreview?: boolean
}

interface MimeChoice {
  mimeType: string
  extension: 'mp4' | 'webm'
}

// mp4(H.264)를 지원하는 브라우저(Safari, 최신 Chrome 일부)에서는 mp4로, 아니면 webm으로 폴백한다.
const MIME_CANDIDATES: MimeChoice[] = [
  { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', extension: 'mp4' },
  { mimeType: 'video/mp4', extension: 'mp4' },
  { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm' },
  { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm' },
  { mimeType: 'video/webm', extension: 'webm' },
]

export function isVideoRecordingSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function'
  )
}

export function pickSupportedVideoMimeType(): MimeChoice | null {
  if (typeof MediaRecorder === 'undefined') return null
  return MIME_CANDIDATES.find((c) => MediaRecorder.isTypeSupported(c.mimeType)) ?? null
}

function findActiveLineIndex(lines: LyricLine[], t: number): number {
  let active = -1
  for (const line of lines) {
    const timed = line.syllables.filter((s) => s.start !== null)
    if (timed.length === 0) continue
    const firstStart = timed[0].start as number
    if (firstStart <= t) active = line.lineIndex
    else break
  }
  return active
}

function nextNonEmptyLine(lines: LyricLine[], afterIndex: number): LyricLine | undefined {
  return lines.find((l) => l.lineIndex > afterIndex && l.syllables.length > 0)
}

function firstNonEmptyLine(lines: LyricLine[]): LyricLine | undefined {
  return lines.find((l) => l.syllables.length > 0)
}

function syllableProgress(syl: Syllable, t: number): number {
  if (syl.start === null) return 0
  const end = syl.end ?? syl.start + 0.001
  if (t <= syl.start) return 0
  if (t >= end) return 1
  return (t - syl.start) / Math.max(end - syl.start, 0.001)
}

/** 음절을 baseColor로 먼저 그리고, progress 비율만큼만 클립해 highlightColor로 덧그린다
 * (KaraokePreview.tsx가 CSS background-clip:text 그라디언트로 만드는 효과와 동일). */
function drawFillSyllable(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  progress: number,
  baseColor: string,
  highlightColor: string,
  fontPx: number,
): number {
  const width = ctx.measureText(text).width
  ctx.fillStyle = baseColor
  ctx.fillText(text, x, y)
  if (progress > 0 && width > 0) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y - fontPx * 1.2, width * progress, fontPx * 1.8)
    ctx.clip()
    ctx.fillStyle = highlightColor
    ctx.fillText(text, x, y)
    ctx.restore()
  }
  return width
}

function measureLineWidth(ctx: CanvasRenderingContext2D, line: LyricLine, spaceWidth: number): number {
  let w = 0
  for (const s of line.syllables) {
    w += ctx.measureText(s.text).width
    if (s.trailingSpace) w += spaceWidth
  }
  return w
}

function drawKaraokeLine(
  ctx: CanvasRenderingContext2D,
  line: LyricLine,
  t: number,
  centerX: number,
  y: number,
  fontPx: number,
  fontFamily: string,
  baseColor: string,
  highlightColor: string,
  dimmed: boolean,
  maxWidth: number,
) {
  if (line.syllables.length === 0) return

  ctx.font = `bold ${fontPx}px ${fontFamily}`
  ctx.textBaseline = 'alphabetic'
  let spaceWidth = ctx.measureText(' ').width
  let totalWidth = measureLineWidth(ctx, line, spaceWidth)

  // 줄바꿈 대신, 캔버스 너비를 넘으면 폰트 크기를 줄여서 한 줄에 맞춘다.
  let effectiveFontPx = fontPx
  if (totalWidth > maxWidth && totalWidth > 0) {
    effectiveFontPx = Math.max(12, fontPx * (maxWidth / totalWidth))
    ctx.font = `bold ${effectiveFontPx}px ${fontFamily}`
    spaceWidth = ctx.measureText(' ').width
    totalWidth = measureLineWidth(ctx, line, spaceWidth)
  }

  let x = centerX - totalWidth / 2
  for (const syl of line.syllables) {
    if (dimmed) {
      ctx.fillStyle = baseColor
      ctx.fillText(syl.text, x, y)
      x += ctx.measureText(syl.text).width
    } else {
      x += drawFillSyllable(ctx, syl.text, x, y, syllableProgress(syl, t), baseColor, highlightColor, effectiveFontPx)
    }
    if (syl.trailingSpace) x += spaceWidth
  }
}

function drawPlainLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  y: number,
  fontPx: number,
  color: string,
  fontFamily: string,
  maxWidth: number,
) {
  ctx.font = `${fontPx}px ${fontFamily}`
  let width = ctx.measureText(text).width
  let effectiveFontPx = fontPx
  if (width > maxWidth && width > 0) {
    effectiveFontPx = Math.max(10, fontPx * (maxWidth / width))
    ctx.font = `${effectiveFontPx}px ${fontFamily}`
    width = ctx.measureText(text).width
  }
  ctx.fillStyle = color
  ctx.fillText(text, centerX - width / 2, y)
}

function renderFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  lines: LyricLine[],
  style: SubtitleStyle,
  t: number,
  showNextLinePreview: boolean,
) {
  ctx.fillStyle = style.backgroundColor
  ctx.fillRect(0, 0, width, height)

  const activeIndex = findActiveLineIndex(lines, t)
  const currentLine = activeIndex >= 0 ? lines[activeIndex] : firstNonEmptyLine(lines)
  const isUpcoming = activeIndex < 0
  const nextLine = currentLine ? nextNonEmptyLine(lines, currentLine.lineIndex) : undefined

  // style.fontSize는 ASS 내보내기와 마찬가지로 1920 폭 기준 값으로 취급하고, 다른 해상도면 비례시킨다.
  const scale = width / 1920
  const maxWidth = width * 0.86
  const mainFontPx = style.fontSize * scale
  const mainY = height * 0.46

  if (currentLine) {
    drawKaraokeLine(
      ctx,
      currentLine,
      t,
      width / 2,
      mainY,
      mainFontPx,
      style.fontFamily,
      style.baseColor,
      style.highlightColor,
      isUpcoming,
      maxWidth,
    )
  } else {
    drawPlainLine(ctx, '가사를 입력해주세요', width / 2, mainY, mainFontPx * 0.5, '#6b7280', style.fontFamily, maxWidth)
  }

  if (showNextLinePreview && nextLine) {
    const previewText = nextLine.syllables.map((s) => s.text + (s.trailingSpace ? ' ' : '')).join('')
    if (previewText.trim()) {
      const previewFontPx = mainFontPx * 0.55
      drawPlainLine(
        ctx,
        previewText,
        width / 2,
        mainY + mainFontPx * 0.9 + previewFontPx,
        previewFontPx,
        style.upcomingColor,
        style.fontFamily,
        maxWidth,
      )
    }
  }
}

export interface VideoRecordResult {
  mimeType: string
  extension: 'mp4' | 'webm'
}

export async function recordKaraokeVideo(
  audioBuffer: AudioBuffer,
  lines: LyricLine[],
  style: SubtitleStyle,
  projectName: string,
  options: VideoRecordOptions = {},
  onProgress?: (ratio: number) => void,
): Promise<VideoRecordResult> {
  if (!isVideoRecordingSupported()) {
    throw new Error('이 브라우저는 영상 녹화(MediaRecorder / canvas.captureStream)를 지원하지 않습니다. 최신 Chrome, Edge, 또는 Safari를 사용해주세요.')
  }
  const choice = pickSupportedVideoMimeType()
  if (!choice) {
    throw new Error('이 브라우저에서 지원하는 영상 인코딩 형식을 찾지 못했습니다.')
  }
  if (!lines.some((l) => l.syllables.some((s) => s.start !== null))) {
    throw new Error('먼저 음절 타이밍을 (자동 정렬 또는 수동 탭으로) 입력해주세요.')
  }

  const width = options.width ?? 1920
  const height = options.height ?? 1080
  const fps = options.fps ?? 30
  const showNextLinePreview = options.showNextLinePreview ?? true

  const audioCtx = getAudioContext()
  // resume()은 반드시 사용자 제스처(버튼 클릭) 호출 스택 안에서 시작돼야 브라우저 자동재생 정책에 걸리지 않는다.
  const resumePromise = audioCtx.state === 'suspended' ? audioCtx.resume() : Promise.resolve()
  await Promise.all([resumePromise, document.fonts.ready.catch(() => undefined)])

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('캔버스를 생성하지 못했습니다.')

  const source = audioCtx.createBufferSource()
  source.buffer = audioBuffer
  const dest = audioCtx.createMediaStreamDestination()
  source.connect(dest)

  const videoStream = canvas.captureStream(fps)
  const combined = new MediaStream([...videoStream.getVideoTracks(), ...dest.stream.getAudioTracks()])

  const recorder = new MediaRecorder(combined, { mimeType: choice.mimeType })
  const chunks: BlobPart[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve()
  })

  const duration = audioBuffer.duration
  const startTime = audioCtx.currentTime
  let rafId = 0

  function tick() {
    const t = audioCtx.currentTime - startTime
    renderFrame(ctx as CanvasRenderingContext2D, width, height, lines, style, Math.min(t, duration), showNextLinePreview)
    onProgress?.(Math.min(1, duration > 0 ? t / duration : 1))
    if (t < duration) {
      rafId = requestAnimationFrame(tick)
    } else {
      recorder.stop()
      source.stop()
    }
  }

  renderFrame(ctx, width, height, lines, style, 0, showNextLinePreview)
  recorder.start(250)
  source.start()
  rafId = requestAnimationFrame(tick)

  try {
    await stopped
  } finally {
    cancelAnimationFrame(rafId)
    dest.disconnect()
    source.disconnect()
  }

  const blob = new Blob(chunks, { type: choice.mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${sanitizeFileName(projectName, 'karaoke')}.${choice.extension}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)

  return { mimeType: choice.mimeType, extension: choice.extension }
}
