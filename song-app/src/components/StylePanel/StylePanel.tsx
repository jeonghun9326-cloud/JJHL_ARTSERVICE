import { useProjectStore } from '../../store/useProjectStore'

export default function StylePanel() {
  const style = useProjectStore((s) => s.project.style)
  const setStyle = useProjectStore((s) => s.setStyle)

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-base-700 bg-base-900 p-3 text-sm">
      <label className="flex items-center gap-2">
        기본 색상
        <input
          type="color"
          value={style.baseColor}
          onChange={(e) => setStyle({ baseColor: e.target.value })}
        />
      </label>
      <label className="flex items-center gap-2">
        강조 색상
        <input
          type="color"
          value={style.highlightColor}
          onChange={(e) => setStyle({ highlightColor: e.target.value })}
        />
      </label>
      <label className="flex items-center gap-2">
        다음 줄 색상
        <input
          type="color"
          value={style.upcomingColor}
          onChange={(e) => setStyle({ upcomingColor: e.target.value })}
        />
      </label>
      <label className="flex items-center gap-2">
        배경 색상
        <input
          type="color"
          value={style.backgroundColor}
          onChange={(e) => setStyle({ backgroundColor: e.target.value })}
        />
      </label>
      <label className="flex items-center gap-2">
        글자 크기
        <input
          type="range"
          min={24}
          max={96}
          value={style.fontSize}
          onChange={(e) => setStyle({ fontSize: Number(e.target.value) })}
        />
        <span className="w-8 tabular-nums text-gray-400">{style.fontSize}</span>
      </label>
    </div>
  )
}
