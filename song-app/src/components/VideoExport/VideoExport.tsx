import { useState } from 'react'
import { useProjectStore } from '../../store/useProjectStore'
import { isVideoRecordingSupported, recordKaraokeVideo } from '../../services/videoRecorder'

type Resolution = '1920x1080' | '1280x720'

export default function VideoExport() {
  const audioBuffer = useProjectStore((s) => s.audioBuffer)
  const lines = useProjectStore((s) => s.project.lines)
  const style = useProjectStore((s) => s.project.style)
  const projectName = useProjectStore((s) => s.project.projectName)
  const wavesurfer = useProjectStore((s) => s.wavesurfer)

  const [resolution, setResolution] = useState<Resolution>('1920x1080')
  const [showNextLinePreview, setShowNextLinePreview] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [progress, setProgress] = useState(0)

  const supported = isVideoRecordingSupported()

  const handleExport = async () => {
    if (!audioBuffer) {
      alert('먼저 오디오 파일을 업로드해주세요.')
      return
    }
    wavesurfer?.pause()

    const [width, height] = resolution.split('x').map(Number)
    setIsExporting(true)
    setProgress(0)
    try {
      const { extension } = await recordKaraokeVideo(
        audioBuffer,
        lines,
        style,
        projectName,
        { width, height, showNextLinePreview },
        setProgress,
      )
      if (extension === 'webm') {
        alert('이 브라우저는 mp4 녹화를 지원하지 않아 webm으로 내보냈습니다. VLC 등 대부분의 플레이어와 영상 편집 프로그램에서 바로 열 수 있고, 필요하면 CapCut 등에서 mp4로 다시 내보낼 수 있습니다.')
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '영상 내보내기에 실패했습니다.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-base-700 bg-base-900 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium">영상으로 내보내기</span>

        <label className="flex items-center gap-2 text-xs text-gray-400">
          해상도
          <select
            value={resolution}
            onChange={(e) => setResolution(e.target.value as Resolution)}
            className="rounded border border-base-700 bg-base-950 px-2 py-1 text-xs"
            disabled={isExporting}
          >
            <option value="1920x1080">1920x1080</option>
            <option value="1280x720">1280x720</option>
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-xs text-gray-400">
          <input
            type="checkbox"
            checked={showNextLinePreview}
            onChange={(e) => setShowNextLinePreview(e.target.checked)}
            disabled={isExporting}
          />
          다음 줄 미리보기 포함
        </label>

        <button
          className="rounded bg-rose-700 px-3 py-1.5 text-sm hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={handleExport}
          disabled={!supported || isExporting || !audioBuffer}
          title="현재 화면에 보이는 노래방 자막을 그대로 실시간으로 녹화해서 영상 파일로 저장합니다. 서버 없이 브라우저에서 바로 처리되고, 곡 길이만큼 시간이 걸립니다."
        >
          {isExporting ? '녹화 중...' : 'MP4로 내보내기'}
        </button>
      </div>

      {isExporting && (
        <div className="flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded bg-base-800">
            <div className="h-full bg-rose-600 transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <span className="w-10 text-right text-xs tabular-nums text-gray-400">{Math.round(progress * 100)}%</span>
        </div>
      )}

      {!supported && (
        <p className="text-xs text-amber-400">
          이 브라우저는 영상 녹화 기능(MediaRecorder / captureStream)을 지원하지 않습니다. 최신 Chrome, Edge, 또는 Safari에서 시도해주세요.
        </p>
      )}
      <p className="text-xs text-gray-500">
        지금 보이는 노래방 화면(배경색·자막 스타일 그대로)을 실시간으로 녹화합니다. 서버로 파일을 보내지 않고 브라우저 안에서 바로 처리되며, 곡 길이만큼 시간이 걸립니다. mp4를 지원하지 않는 브라우저에서는 자동으로 webm으로 저장됩니다.
      </p>
    </div>
  )
}
