import { useRef, useState } from 'react'
import { useProjectStore } from '../../store/useProjectStore'
import { deserializeProject, readFileAsText } from '../../services/ProjectStorage'
import { downloadLineLevelSrt } from '../../services/srtExport'
import { downloadLineLevelAss } from '../../services/assExport'

export default function ProjectControls() {
  const projectName = useProjectStore((s) => s.project.projectName)
  const setProjectName = useProjectStore((s) => s.setProjectName)
  const newProject = useProjectStore((s) => s.newProject)
  const saveProjectToDisk = useProjectStore((s) => s.saveProjectToDisk)
  const loadProjectFromFile = useProjectStore((s) => s.loadProjectFromFile)
  const lines = useProjectStore((s) => s.project.lines)
  const style = useProjectStore((s) => s.project.style)

  const [showNextLinePreview, setShowNextLinePreview] = useState(true)
  const [nextLineFontSizeDelta, setNextLineFontSizeDelta] = useState(-1)

  const handleExportSrt = async () => {
    const { exportedLineCount, skippedLineCount } = await downloadLineLevelSrt(lines, projectName, {
      includePreviewTrack: showNextLinePreview,
    })
    if (exportedLineCount === 0) {
      alert('내보낼 수 있는 줄이 없습니다. 먼저 음절 타이밍을 (자동 정렬 또는 수동 탭으로) 입력해주세요.')
    } else if (showNextLinePreview) {
      alert(
        `현재 줄용 .srt와 다음 줄 미리보기용 .preview.srt, 총 2개 파일을 내보냈습니다. CapCut 등에서 두 파일을 각각 별도 자막 트랙으로 불러온 뒤, 트랙마다 다른 글자 크기를 지정하면 노래방처럼 보이게 만들 수 있습니다.` +
          (skippedLineCount > 0 ? ` (타이밍이 없는 ${skippedLineCount}개 줄은 제외됨)` : ''),
      )
    } else if (skippedLineCount > 0) {
      alert(
        `${exportedLineCount}개 줄을 SRT로 내보냈습니다. 타이밍이 입력되지 않은 ${skippedLineCount}개 줄은 제외되었습니다.`,
      )
    }
  }

  const handleExportAss = () => {
    const { exportedLineCount, skippedLineCount } = downloadLineLevelAss(lines, style, projectName, {
      showNextLinePreview,
      nextLineFontSizeDelta,
    })
    if (exportedLineCount === 0) {
      alert('내보낼 수 있는 줄이 없습니다. 먼저 음절 타이밍을 (자동 정렬 또는 수동 탭으로) 입력해주세요.')
    } else if (skippedLineCount > 0) {
      alert(
        `${exportedLineCount}개 줄을 ASS로 내보냈습니다. 타이밍이 입력되지 않은 ${skippedLineCount}개 줄은 제외되었습니다.`,
      )
    }
  }

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleLoadClick = () => fileInputRef.current?.click()

  const handleFileChange = async (file: File | null) => {
    if (!file) return
    try {
      const text = await readFileAsText(file)
      const project = deserializeProject(text)
      await loadProjectFromFile(project)
      if (project.audio) {
        alert(
          '프로젝트를 불러왔습니다. 이 브라우저에 저장된 오디오가 없다면, 원본 오디오 파일을 다시 업로드해주세요.',
        )
      }
    } catch (err) {
      console.error(err)
      alert('프로젝트 파일을 불러오지 못했습니다. 올바른 .json 파일인지 확인해주세요.')
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
        className="rounded border border-base-700 bg-base-950 px-2 py-1 text-sm"
        placeholder="프로젝트 이름"
      />
      <button
        className="rounded bg-base-700 px-3 py-1.5 text-sm hover:bg-base-600"
        onClick={() => {
          if (confirm('현재 작업 중인 내용을 새 프로젝트로 초기화할까요? 저장하지 않은 내용은 사라집니다.')) {
            newProject()
          }
        }}
      >
        새 프로젝트
      </button>
      <button
        className="rounded bg-emerald-700 px-3 py-1.5 text-sm hover:bg-emerald-600"
        onClick={saveProjectToDisk}
      >
        프로젝트 저장 (.json)
      </button>
      <button className="rounded bg-base-700 px-3 py-1.5 text-sm hover:bg-base-600" onClick={handleLoadClick}>
        프로젝트 불러오기
      </button>
      <button
        className="rounded bg-sky-700 px-3 py-1.5 text-sm hover:bg-sky-600"
        onClick={handleExportSrt}
        title="영상 편집 프로그램에서 바로 불러올 수 있는 줄 단위 자막 파일을 내보냅니다. 다음 줄 미리보기를 켜면 CapCut 등에서 트랙별로 다른 글자 크기를 줄 수 있도록 파일을 2개(현재 줄 / 다음 줄)로 나눠 내보냅니다."
      >
        SRT 내보내기 (줄 단위)
      </button>
      <button
        className="rounded bg-indigo-700 px-3 py-1.5 text-sm hover:bg-indigo-600"
        onClick={handleExportAss}
        title="줄마다 다른 폰트 크기/색상을 실제로 지정할 수 있는 ASS 자막 파일을 내보냅니다 (Aegisub, VLC, mpv 등에서 스타일 그대로 재생됨)"
      >
        ASS 내보내기 (줄별 크기 지정)
      </button>
      <label className="flex items-center gap-1.5 text-xs text-gray-400">
        <input
          type="checkbox"
          checked={showNextLinePreview}
          onChange={(e) => setShowNextLinePreview(e.target.checked)}
        />
        노래방처럼 다음 줄 미리보기 포함 (SRT는 파일 2개, ASS는 한 파일에 작게 표시)
      </label>
      {showNextLinePreview && (
        <label className="flex items-center gap-1.5 text-xs text-gray-400">
          다음 줄 폰트 크기 차이 (ASS 전용)
          <input
            type="number"
            value={nextLineFontSizeDelta}
            onChange={(e) => setNextLineFontSizeDelta(Number(e.target.value))}
            className="w-14 rounded border border-base-700 bg-base-950 px-1 py-0.5 text-xs"
            max={0}
          />
        </label>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
      />
    </div>
  )
}
