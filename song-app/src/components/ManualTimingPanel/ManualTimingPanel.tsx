import { useEffect, useMemo, useState } from 'react'
import { useProjectStore } from '../../store/useProjectStore'
import { flattenSyllables } from '../../services/lyricsParser'

const DEFAULT_REACTION_OFFSET_MS = 150

export default function ManualTimingPanel() {
  const lines = useProjectStore((s) => s.project.lines)
  const manualPointer = useProjectStore((s) => s.manualPointer)
  const manualClosed = useProjectStore((s) => s.manualClosed)
  const tapManualTiming = useProjectStore((s) => s.tapManualTiming)
  const undoManualTiming = useProjectStore((s) => s.undoManualTiming)
  const resetManualTiming = useProjectStore((s) => s.resetManualTiming)

  const [reactionOffsetMs, setReactionOffsetMs] = useState(DEFAULT_REACTION_OFFSET_MS)

  const handleTap = () => {
    const correctedTime = Math.max(0, useProjectStore.getState().currentTime - reactionOffsetMs / 1000)
    tapManualTiming(correctedTime)
  }

  const syllables = useMemo(() => flattenSyllables(lines), [lines])
  const total = syllables.length
  const currentSyllable = manualPointer < total ? syllables[manualPointer] : null
  const currentLineIndex = currentSyllable
    ? currentSyllable.lineIndex
    : syllables[total - 1]?.lineIndex ?? 0
  const currentLine = lines[currentLineIndex]
  const nextLine = lines[currentLineIndex + 1]

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const isEditable =
        !!target &&
        (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)
      if (isEditable) return

      if (e.code === 'Space') {
        e.preventDefault()
        handleTap()
      } else if (e.code === 'Backspace') {
        e.preventDefault()
        undoManualTiming()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleTap, undoManualTiming])

  const isDone = manualPointer >= total && manualClosed && total > 0

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-base-700 bg-base-900 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-300">수동 타이밍 입력 (실시간 탭)</h2>
        <div className="flex gap-2">
          <button
            onClick={() => undoManualTiming()}
            className="rounded bg-base-700 px-2 py-1 text-xs hover:bg-base-600"
          >
            되돌리기 (Backspace)
          </button>
          <button
            onClick={() => {
              if (confirm('입력한 모든 수동 타이밍을 초기화할까요? (드래그로 조정한 값도 초기화됩니다)')) {
                resetManualTiming()
              }
            }}
            className="rounded bg-base-700 px-2 py-1 text-xs hover:bg-base-600"
          >
            처음부터
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-500">
        노래를 재생한 상태에서 <kbd className="rounded bg-base-800 px-1">Space</kbd> 키를 누르거나 아래 가사
        박스를 클릭할 때마다 다음 음절의 타이밍이 현재 재생 시간으로 기록됩니다. 진행:{' '}
        {Math.min(manualPointer, total)} / {total}
      </p>

      <label className="flex items-center gap-2 text-xs text-gray-400">
        반응속도 보정
        <input
          type="range"
          min={0}
          max={400}
          step={10}
          value={reactionOffsetMs}
          onChange={(e) => setReactionOffsetMs(Number(e.target.value))}
          className="w-32"
        />
        <span className="tabular-nums">{reactionOffsetMs}ms 앞당김</span>
      </label>
      <p className="text-xs text-gray-500">
        사람은 소리를 듣고 반응하기까지 지연이 있어 늘 살짝 늦게 누르게 됩니다. 이 값만큼 기록 시각을 앞당깁니다.
        너무 이르게 잡히면 값을 줄이고, 계속 늦게 잡히면 값을 늘려보세요.
      </p>

      {total === 0 ? (
        <p className="text-sm text-gray-500">먼저 가사를 입력해주세요.</p>
      ) : (
        <>
          <div
            role="button"
            tabIndex={0}
            onClick={handleTap}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTap()
            }}
            className="cursor-pointer select-none rounded bg-base-950 p-4 text-2xl leading-relaxed transition-colors active:bg-base-900"
            title="클릭할 때마다 스페이스와 동일하게 타이밍이 기록됩니다"
          >
            {currentLine?.syllables.map((syl) => {
              const idx = syllables.findIndex((s) => s.id === syl.id)
              const stateClass =
                idx < manualPointer
                  ? 'text-green-400'
                  : idx === manualPointer
                    ? 'bg-yellow-400 text-black rounded px-1'
                    : 'text-gray-500'
              return (
                <span key={syl.id} className={stateClass}>
                  {syl.text}
                  {syl.trailingSpace ? ' ' : ''}
                </span>
              )
            })}
          </div>
          {nextLine && (
            <div className="rounded bg-base-950/60 p-3 text-base text-gray-500">
              다음 줄: {nextLine.rawText || ' '}
            </div>
          )}
          {isDone && (
            <p className="text-sm text-green-400">모든 음절의 타이밍 입력이 완료되었습니다. 파형에서 세부 조정을 할 수 있습니다.</p>
          )}
          {!isDone && manualPointer >= total && !manualClosed && (
            <p className="text-sm text-yellow-400">
              마지막 음절이 끝나는 시점에 Space를 한 번 더 눌러 마무리하세요.
            </p>
          )}
        </>
      )}
    </div>
  )
}
