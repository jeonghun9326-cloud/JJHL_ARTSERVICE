import { useProjectStore } from './store/useProjectStore'
import AudioUpload from './components/AudioUpload/AudioUpload'
import LyricsInput from './components/LyricsInput/LyricsInput'
import WaveformEditor from './components/WaveformEditor/WaveformEditor'
import ManualTimingPanel from './components/ManualTimingPanel/ManualTimingPanel'
import KaraokePreview from './components/KaraokePreview/KaraokePreview'
import ProjectControls from './components/ProjectControls/ProjectControls'
import AlignmentControls from './components/AlignmentControls/AlignmentControls'
import StylePanel from './components/StylePanel/StylePanel'
import VideoExport from './components/VideoExport/VideoExport'

function App() {
  const view = useProjectStore((s) => s.view)
  const setView = useProjectStore((s) => s.setView)

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-base-700 pb-3">
        <div className="flex items-center gap-3">
          <a href="/" className="text-xs text-blue-400 hover:underline">
            ← JJHL 홈으로
          </a>
          <h1 className="text-lg font-bold">노래방 자막 제작기</h1>
        </div>
        <ProjectControls />
      </header>

      <nav className="flex gap-2">
        <button
          className={`rounded px-4 py-1.5 text-sm font-medium ${
            view === 'editor' ? 'bg-blue-600' : 'bg-base-800 hover:bg-base-700'
          }`}
          onClick={() => setView('editor')}
        >
          편집
        </button>
        <button
          className={`rounded px-4 py-1.5 text-sm font-medium ${
            view === 'preview' ? 'bg-blue-600' : 'bg-base-800 hover:bg-base-700'
          }`}
          onClick={() => setView('preview')}
        >
          노래방 미리보기
        </button>
      </nav>

      <main className="flex flex-1 flex-col gap-4">
        <div style={{ display: view === 'editor' ? 'flex' : 'none' }} className="flex-wrap items-center gap-3 rounded-lg border border-base-700 bg-base-900 p-3">
          <AudioUpload />
        </div>

        <div style={{ display: view === 'preview' ? 'flex' : 'none' }} className="flex-col gap-4">
          <StylePanel />
          <KaraokePreview />
          <VideoExport />
        </div>

        {/* WaveSurfer 인스턴스는 탭 전환과 무관하게 항상 유지되어야 재생/타이밍 편집이 끊기지 않는다 */}
        <WaveformEditor />

        <div style={{ display: view === 'editor' ? 'flex' : 'none' }} className="flex-col gap-4">
          <AlignmentControls />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <LyricsInput />
            <ManualTimingPanel />
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
