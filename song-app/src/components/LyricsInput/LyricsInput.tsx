import { useState, useEffect, useRef } from 'react'
import { useProjectStore } from '../../store/useProjectStore'

export default function LyricsInput() {
  const lyricsRaw = useProjectStore((s) => s.project.lyricsRaw)
  const setLyricsRaw = useProjectStore((s) => s.setLyricsRaw)
  const importFromSrt = useProjectStore((s) => s.importFromSrt)
  const [draft, setDraft] = useState(lyricsRaw)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDraft(lyricsRaw)
  }, [lyricsRaw])

  const commit = () => {
    if (draft !== lyricsRaw) setLyricsRaw(draft)
  }

  const handleSrtFile = async (file: File) => {
    try {
      const text = await file.text()
      importFromSrt(text)
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-300">전체 가사</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">줄바꿈 구조 유지 · 입력 후 다른 곳을 클릭하면 반영됩니다</span>
          <button
            type="button"
            className="rounded bg-base-700 px-2 py-1 text-xs font-medium hover:bg-base-600"
            onClick={() => fileInputRef.current?.click()}
            title="SRT 자막 파일을 업로드하면 그 파일의 줄과 타이밍을 그대로 가져옵니다"
          >
            SRT로 가져오기
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".srt,text/plain"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleSrtFile(file)
              e.target.value = ''
            }}
          />
        </div>
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        placeholder={'가사를 붙여넣거나 입력하세요.\n예)\n가끔은 궁금했어\n지금은 뭘 하고 있을지'}
        className="min-h-[220px] flex-1 resize-none rounded-lg border border-base-700 bg-base-950 p-3 text-sm leading-7 text-gray-100 outline-none focus:border-blue-500"
        spellCheck={false}
      />
      <p className="text-xs text-gray-500">
        SRT로 가져오면 자막 큐 하나가 가사 한 줄이 되고, 큐의 시작/끝 시간을 그 줄의 타이밍으로 사용합니다(줄 안의
        음절 타이밍은 글자수 비례로 자동 배분). 기존 가사/타이밍은 대체되며, 이후 파형 화면에서 음절 단위(드래그,
        ←/→) 또는 줄 전체 단위(Ctrl+←/→)로 다시 조정할 수 있습니다.
      </p>
    </div>
  )
}
