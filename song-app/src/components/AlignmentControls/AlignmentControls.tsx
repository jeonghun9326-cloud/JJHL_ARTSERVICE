import { useProjectStore } from '../../store/useProjectStore'

export default function AlignmentControls() {
  const runAutoAlignment = useProjectStore((s) => s.runAutoAlignment)
  const alignmentRunning = useProjectStore((s) => s.alignmentRunning)
  const alignmentProgress = useProjectStore((s) => s.alignmentProgress)
  const audioBuffer = useProjectStore((s) => s.audioBuffer)
  const linesCount = useProjectStore((s) => s.project.lines.length)

  const handleClick = async () => {
    try {
      await runAutoAlignment()
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-base-700 bg-base-900 p-3">
      <div className="flex items-center gap-3">
        <button
          className="rounded bg-purple-700 px-3 py-1.5 text-sm font-medium hover:bg-purple-600 disabled:opacity-40"
          onClick={handleClick}
          disabled={!audioBuffer || linesCount === 0 || alignmentRunning}
        >
          {alignmentRunning ? '분석 중...' : '자동 타이밍 추정 실행'}
        </button>
        <span className="text-xs text-gray-500">
          파형 에너지 기반 휴리스틱 추정입니다. 실제 발음(Forced Alignment)과는 오차가 있을 수 있으니 결과를
          검수/수정해주세요.
        </span>
      </div>

      {alignmentRunning && alignmentProgress && (
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-base-800">
          <div
            className="h-full bg-purple-500 transition-all"
            style={{ width: `${Math.round(alignmentProgress.ratio * 100)}%` }}
          />
        </div>
      )}
      {alignmentRunning && alignmentProgress?.message && (
        <p className="text-xs text-gray-500">{alignmentProgress.message}</p>
      )}
    </div>
  )
}
