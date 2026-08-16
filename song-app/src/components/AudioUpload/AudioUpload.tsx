import { useRef } from 'react'
import { useProjectStore } from '../../store/useProjectStore'

const ACCEPTED_TYPES = ['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp3']

export default function AudioUpload() {
  const inputRef = useRef<HTMLInputElement>(null)
  const loadAudioFile = useProjectStore((s) => s.loadAudioFile)
  const isDecodingAudio = useProjectStore((s) => s.isDecodingAudio)
  const audioInfo = useProjectStore((s) => s.project.audio)

  const handleFile = async (file: File | null) => {
    if (!file) return
    const isAcceptable =
      ACCEPTED_TYPES.includes(file.type) || /\.(wav|mp3)$/i.test(file.name)
    if (!isAcceptable) {
      alert('WAV 또는 MP3 파일만 업로드할 수 있습니다.')
      return
    }
    try {
      await loadAudioFile(file)
    } catch (err) {
      console.error(err)
      alert('오디오 파일을 불러오는 중 오류가 발생했습니다.')
    }
  }

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept=".wav,.mp3,audio/wav,audio/mpeg"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />
      <button
        className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
        onClick={() => inputRef.current?.click()}
        disabled={isDecodingAudio}
      >
        {isDecodingAudio ? '분석 중...' : '보컬 파일 업로드'}
      </button>
      {audioInfo && (
        <span className="truncate text-sm text-gray-400" title={audioInfo.fileName}>
          {audioInfo.fileName} ({audioInfo.duration.toFixed(1)}s)
        </span>
      )}
    </div>
  )
}
