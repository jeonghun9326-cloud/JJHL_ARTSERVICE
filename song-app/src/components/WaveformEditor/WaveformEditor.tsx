import { useEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin, { type Region } from 'wavesurfer.js/dist/plugins/regions.js'
import { useProjectStore } from '../../store/useProjectStore'
import { flattenSyllables } from '../../services/lyricsParser'
import { formatTime } from '../../utils/time'

const MIN_ZOOM = 20
const MAX_ZOOM = 500
const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5]
const SMALL_NUDGE_SECONDS = 0.01
const LARGE_NUDGE_SECONDS = 0.05

function regionColorForLine(lineIndex: number, hasEnd: boolean, selected: boolean): string {
  if (selected) return 'rgba(255, 255, 255, 0.35)'
  if (!hasEnd) return 'rgba(255, 210, 63, 0.25)'
  return lineIndex % 2 === 0 ? 'rgba(91, 140, 255, 0.28)' : 'rgba(63, 200, 160, 0.28)'
}

export default function WaveformEditor() {
  const containerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WaveSurfer | null>(null)
  const regionsRef = useRef<RegionsPlugin | null>(null)
  const isInternalUpdate = useRef(false)

  const audioObjectUrl = useProjectStore((s) => s.audioObjectUrl)
  const lines = useProjectStore((s) => s.project.lines)
  const currentTime = useProjectStore((s) => s.currentTime)
  const isPlaying = useProjectStore((s) => s.isPlaying)
  const setWavesurfer = useProjectStore((s) => s.setWavesurfer)
  const setCurrentTime = useProjectStore((s) => s.setCurrentTime)
  const setIsPlaying = useProjectStore((s) => s.setIsPlaying)
  const updateSyllableTiming = useProjectStore((s) => s.updateSyllableTiming)
  const shiftLineTiming = useProjectStore((s) => s.shiftLineTiming)
  const togglePlay = useProjectStore((s) => s.togglePlay)
  const seekTo = useProjectStore((s) => s.seekTo)

  const [zoom, setZoom] = useState(100)
  const [duration, setDuration] = useState(0)
  const [ready, setReady] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null)
  const selectedRegionIdRef = useRef<string | null>(null)
  selectedRegionIdRef.current = selectedRegionId

  // 오디오가 바뀔 때마다 WaveSurfer 인스턴스를 새로 생성
  useEffect(() => {
    if (!containerRef.current || !audioObjectUrl) return

    const regions = RegionsPlugin.create()
    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#3a4356',
      progressColor: '#4c5568',
      cursorColor: '#ffd23f',
      cursorWidth: 2,
      height: 130,
      minPxPerSec: zoom,
      normalize: true,
      dragToSeek: false,
      plugins: [regions],
    })
    ws.load(audioObjectUrl)

    ws.on('ready', (dur) => {
      setDuration(dur)
      setReady(true)
    })
    ws.on('timeupdate', (t) => setCurrentTime(t))
    ws.on('play', () => setIsPlaying(true))
    ws.on('pause', () => setIsPlaying(false))

    regions.on('region-updated', (region: Region) => {
      isInternalUpdate.current = true
      updateSyllableTiming(region.id, { start: region.start, end: region.end })
    })
    regions.on('region-clicked', (region: Region, e: MouseEvent) => {
      e.stopPropagation()
      ws.setTime(region.start)
      setSelectedRegionId(region.id)
    })

    wsRef.current = ws
    regionsRef.current = regions
    setWavesurfer(ws)

    return () => {
      ws.destroy()
      wsRef.current = null
      regionsRef.current = null
      setWavesurfer(null)
      setReady(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioObjectUrl])

  // 음절 타이밍(store)이 바뀔 때마다 리전을 다시 그림 (드래그로 인한 직후 업데이트는 스킵)
  useEffect(() => {
    if (!regionsRef.current || !ready) return
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false
      return
    }
    const regions = regionsRef.current
    regions.clearRegions()
    const syllables = flattenSyllables(lines)
    for (const syl of syllables) {
      if (syl.start === null) continue
      const end = syl.end ?? syl.start + 0.3
      regions.addRegion({
        id: syl.id,
        start: syl.start,
        end,
        content: syl.text,
        color: regionColorForLine(syl.lineIndex, syl.end !== null, syl.id === selectedRegionId),
        drag: true,
        resize: syl.end !== null,
      })
    }
  }, [lines, ready, selectedRegionId])

  useEffect(() => {
    wsRef.current?.zoom(zoom)
  }, [zoom])

  useEffect(() => {
    wsRef.current?.setPlaybackRate(playbackRate, true)
  }, [playbackRate])

  // 선택된 음절 리전을 화살표 키로 미세 조정 (마우스 드래그보다 정밀함)
  // ←/→: 시작 시각 이동, Alt+←/→: 종료 시각 이동, Shift: 큰 폭(50ms), 기본 10ms
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const isEditable =
        !!target &&
        (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)
      if (isEditable) return
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return

      const selectedId = selectedRegionIdRef.current
      if (!selectedId) return

      const syllables = flattenSyllables(lines)
      const syl = syllables.find((s) => s.id === selectedId)
      if (!syl || syl.start === null) return

      e.preventDefault()
      const step = (e.shiftKey ? LARGE_NUDGE_SECONDS : SMALL_NUDGE_SECONDS) * (e.key === 'ArrowLeft' ? -1 : 1)

      if (e.ctrlKey || e.metaKey) {
        // 줄 전체를 통째로 이동(상대 간격 유지). SRT로 가져온 줄을 통째로 살짝 당기고 싶을 때 유용하다.
        shiftLineTiming(syl.lineIndex, step)
      } else if (e.altKey) {
        if (syl.end === null) return
        const newEnd = Math.max(syl.start + 0.02, syl.end + step)
        updateSyllableTiming(selectedId, { end: newEnd })
      } else {
        const newStart = Math.max(0, syl.start + step)
        if (syl.end !== null && newStart >= syl.end) return
        updateSyllableTiming(selectedId, { start: newStart })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [lines, updateSyllableTiming, shiftLineTiming])

  const unplacedSyllables = flattenSyllables(lines).filter((s) => s.start === null)

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-base-700 bg-base-900 p-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button
          className="rounded bg-base-700 px-3 py-1.5 font-medium hover:bg-base-600 disabled:opacity-40"
          onClick={() => togglePlay()}
          disabled={!ready}
        >
          {isPlaying ? '일시정지' : '재생'}
        </button>
        <button
          className="rounded bg-base-700 px-3 py-1.5 hover:bg-base-600 disabled:opacity-40"
          onClick={() => seekTo(0)}
          disabled={!ready}
        >
          처음으로
        </button>
        <span className="tabular-nums text-base-300 text-gray-300">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        <label className="flex items-center gap-1.5">
          <span className="text-gray-400">배속</span>
          <select
            value={playbackRate}
            onChange={(e) => setPlaybackRate(Number(e.target.value))}
            className="rounded border border-base-700 bg-base-950 px-1.5 py-1 text-xs"
          >
            {PLAYBACK_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate}x
              </option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-gray-400">확대</span>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-32"
          />
        </div>
      </div>

      {unplacedSyllables.length > 0 && (
        <div className="flex flex-wrap gap-1 rounded border border-dashed border-base-700 bg-base-950 p-2 text-sm">
          <span className="mr-1 text-gray-500">미배치 음절:</span>
          {unplacedSyllables.slice(0, 60).map((s) => (
            <span key={s.id} className="rounded bg-base-800 px-1.5 py-0.5 text-gray-300">
              {s.text}
            </span>
          ))}
          {unplacedSyllables.length > 60 && (
            <span className="text-gray-500">외 {unplacedSyllables.length - 60}개</span>
          )}
        </div>
      )}

      {!audioObjectUrl && (
        <div className="flex h-32 items-center justify-center text-sm text-gray-500">
          오디오 파일을 업로드하면 파형이 표시됩니다.
        </div>
      )}
      <div ref={containerRef} className="w-full" data-testid="waveform-container" />
      <p className="text-xs text-gray-500">
        파형을 클릭하면 해당 위치부터 재생됩니다. 배치된 음절 블록의 좌우 경계를 드래그하면 타이밍을 수정할 수
        있습니다. 음절 블록을 클릭해 선택한 뒤 <kbd className="rounded bg-base-800 px-1">←</kbd>/
        <kbd className="rounded bg-base-800 px-1">→</kbd>로 시작 시각을, <kbd className="rounded bg-base-800 px-1">Alt</kbd>+
        화살표로 종료 시각을 10ms 단위(<kbd className="rounded bg-base-800 px-1">Shift</kbd> 누르면 50ms 단위)로
        미세 조정할 수 있습니다. <kbd className="rounded bg-base-800 px-1">Ctrl</kbd>+화살표를 누르면 선택된 음절이
        속한 줄 전체가 상대 간격을 유지한 채 함께 이동합니다(SRT로 가져온 줄을 통째로 보정할 때 유용).
      </p>
    </div>
  )
}
