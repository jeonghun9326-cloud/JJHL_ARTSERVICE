import { create } from 'zustand'
import type WaveSurfer from 'wavesurfer.js'
import type { KaraokeProject, LyricLine, Syllable, SubtitleStyle } from '../types/project'
import { createEmptyProject } from '../types/project'
import { parseLyrics, reparseLyricsPreservingTimings, flattenSyllables } from '../services/lyricsParser'
import { parseSrt } from '../services/srtImport'
import { distributeSyllablesInRange } from '../services/alignment/distribute'
import {
  generateStorageId,
  saveAudioBlob,
  loadAudioBlob,
  downloadProjectFile,
} from '../services/ProjectStorage'
import { decodeAudioBlob } from '../services/audio'
import { createDefaultAlignmentService } from '../services/alignment/EnergyBasedAlignmentService'
import type { AlignmentProgress, AlignmentService, AlignmentTimingResult } from '../services/AlignmentService'

export type ViewMode = 'editor' | 'preview'

interface ProjectState {
  project: KaraokeProject
  audioObjectUrl: string | null
  audioBuffer: AudioBuffer | null
  isDecodingAudio: boolean

  wavesurfer: WaveSurfer | null
  currentTime: number
  isPlaying: boolean
  view: ViewMode

  manualPointer: number
  manualClosed: boolean

  alignmentRunning: boolean
  alignmentProgress: AlignmentProgress | null

  // project lifecycle
  newProject: () => void
  setProjectName: (name: string) => void
  loadAudioFile: (file: File) => Promise<void>
  loadProjectFromFile: (project: KaraokeProject, audioBlob?: Blob) => Promise<void>
  saveProjectToDisk: () => void

  // lyrics
  setLyricsRaw: (text: string) => void
  importFromSrt: (srtText: string) => void

  // timings
  updateSyllableTiming: (id: string, patch: { start?: number | null; end?: number | null }) => void
  shiftLineTiming: (lineIndex: number, deltaSeconds: number) => void
  applyAlignmentResults: (results: AlignmentTimingResult[]) => void
  runAutoAlignment: () => Promise<void>

  // manual tap timing
  tapManualTiming: (time: number) => void
  undoManualTiming: () => void
  resetManualTiming: () => void

  // style
  setStyle: (patch: Partial<SubtitleStyle>) => void

  // playback
  setWavesurfer: (ws: WaveSurfer | null) => void
  setCurrentTime: (t: number) => void
  setIsPlaying: (b: boolean) => void
  togglePlay: () => void
  seekTo: (t: number) => void

  setView: (v: ViewMode) => void
}

function updateSyllableInLines(
  lines: LyricLine[],
  id: string,
  patch: { start?: number | null; end?: number | null },
): LyricLine[] {
  return lines.map((line) => {
    if (!line.syllables.some((s) => s.id === id)) return line
    return {
      ...line,
      syllables: line.syllables.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }
  })
}

function applyResultsToLines(lines: LyricLine[], results: AlignmentTimingResult[]): LyricLine[] {
  const patchMap = new Map(results.map((r) => [r.syllableId, r]))
  return lines.map((line) => ({
    ...line,
    syllables: line.syllables.map((s) => {
      const patch = patchMap.get(s.id)
      return patch ? { ...s, start: patch.start, end: patch.end } : s
    }),
  }))
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: createEmptyProject(),
  audioObjectUrl: null,
  audioBuffer: null,
  isDecodingAudio: false,

  wavesurfer: null,
  currentTime: 0,
  isPlaying: false,
  view: 'editor',

  manualPointer: 0,
  manualClosed: true,

  alignmentRunning: false,
  alignmentProgress: null,

  newProject: () => {
    const prevUrl = get().audioObjectUrl
    if (prevUrl) URL.revokeObjectURL(prevUrl)
    set({
      project: createEmptyProject(),
      audioObjectUrl: null,
      audioBuffer: null,
      manualPointer: 0,
      manualClosed: true,
      currentTime: 0,
      isPlaying: false,
    })
  },

  setProjectName: (name) =>
    set((state) => ({
      project: { ...state.project, projectName: name, updatedAt: new Date().toISOString() },
    })),

  loadAudioFile: async (file: File) => {
    set({ isDecodingAudio: true })
    try {
      const storageId = generateStorageId()
      await saveAudioBlob(storageId, file)
      const audioBuffer = await decodeAudioBlob(file)
      const prevUrl = get().audioObjectUrl
      if (prevUrl) URL.revokeObjectURL(prevUrl)
      const objectUrl = URL.createObjectURL(file)

      set((state) => ({
        audioObjectUrl: objectUrl,
        audioBuffer,
        isDecodingAudio: false,
        project: {
          ...state.project,
          updatedAt: new Date().toISOString(),
          audio: {
            storageId,
            fileName: file.name,
            mimeType: file.type || 'audio/mpeg',
            duration: audioBuffer.duration,
            sizeBytes: file.size,
          },
        },
      }))
    } catch (err) {
      set({ isDecodingAudio: false })
      throw err
    }
  },

  loadProjectFromFile: async (project: KaraokeProject, audioBlob?: Blob) => {
    const prevUrl = get().audioObjectUrl
    if (prevUrl) URL.revokeObjectURL(prevUrl)

    let audioObjectUrl: string | null = null
    let audioBuffer: AudioBuffer | null = null

    let blob = audioBlob
    if (!blob && project.audio) {
      blob = await loadAudioBlob(project.audio.storageId)
    }
    if (blob) {
      audioObjectUrl = URL.createObjectURL(blob)
      try {
        audioBuffer = await decodeAudioBlob(blob)
      } catch {
        audioBuffer = null
      }
    }

    set({
      project,
      audioObjectUrl,
      audioBuffer,
      manualPointer: 0,
      manualClosed: true,
      currentTime: 0,
      isPlaying: false,
    })
  },

  saveProjectToDisk: () => {
    downloadProjectFile(get().project)
  },

  setLyricsRaw: (text: string) =>
    set((state) => {
      const lines =
        state.project.lines.length > 0
          ? reparseLyricsPreservingTimings(text, state.project.lines)
          : parseLyrics(text)
      return {
        project: {
          ...state.project,
          lyricsRaw: text,
          lines,
          updatedAt: new Date().toISOString(),
        },
        manualPointer: 0,
        manualClosed: true,
      }
    }),

  // SRT 파일 하나를 "가사 입력 + 타이밍"을 한번에 대체하는 소스로 가져온다.
  // SRT 큐 하나 = 가사 한 줄로 취급하므로(파싱된 rawText 자체를 큐 텍스트로 재구성),
  // 줄과 큐가 항상 1:1로 맞아 매칭 모호성이 없다. 큐 구간 안의 음절별 타이밍은
  // 자동 정렬과 같은 글자수 비례 분배로 채우고, 이후 파형 화면에서 음절 단위/줄 단위로
  // 얼마든지 다시 조정할 수 있다(일반 음절과 동일한 데이터라 별도 처리 불필요).
  importFromSrt: (srtText: string) => {
    const cues = parseSrt(srtText)
    if (cues.length === 0) {
      throw new Error('SRT 파일에서 자막 큐를 찾지 못했습니다. 파일 형식을 확인해주세요.')
    }

    const rawText = cues.map((c) => c.text).join('\n')
    const lines = parseLyrics(rawText)

    let results: AlignmentTimingResult[] = []
    lines.forEach((line, i) => {
      const cue = cues[i]
      if (!cue || line.syllables.length === 0) return
      results = results.concat(distributeSyllablesInRange(line.syllables, cue.start, cue.end))
    })
    const timedLines = applyResultsToLines(lines, results)

    set((state) => ({
      project: {
        ...state.project,
        lyricsRaw: rawText,
        lines: timedLines,
        updatedAt: new Date().toISOString(),
      },
      manualPointer: 0,
      manualClosed: true,
    }))
  },

  updateSyllableTiming: (id, patch) =>
    set((state) => ({
      project: {
        ...state.project,
        lines: updateSyllableInLines(state.project.lines, id, patch),
        updatedAt: new Date().toISOString(),
      },
    })),

  // 선택된 음절이 속한 줄의 모든 음절을 한 번에 delta만큼 이동한다(상대 간격 유지).
  // 줄 전체를 통째로 앞/뒤로 미세 조정할 때 쓴다 — WaveformEditor의 Ctrl+화살표.
  shiftLineTiming: (lineIndex, deltaSeconds) =>
    set((state) => ({
      project: {
        ...state.project,
        lines: state.project.lines.map((line) => {
          if (line.lineIndex !== lineIndex) return line
          return {
            ...line,
            syllables: line.syllables.map((s) =>
              s.start === null
                ? s
                : {
                    ...s,
                    start: Math.max(0, s.start + deltaSeconds),
                    end: s.end === null ? s.end : Math.max(0, s.end + deltaSeconds),
                  },
            ),
          }
        }),
        updatedAt: new Date().toISOString(),
      },
    })),

  applyAlignmentResults: (results) =>
    set((state) => ({
      project: {
        ...state.project,
        lines: applyResultsToLines(state.project.lines, results),
        updatedAt: new Date().toISOString(),
      },
    })),

  runAutoAlignment: async () => {
    const { audioBuffer, project } = get()
    if (!audioBuffer) {
      throw new Error('먼저 오디오 파일을 업로드해주세요.')
    }
    if (project.lines.length === 0) {
      throw new Error('먼저 가사를 입력해주세요.')
    }
    set({ alignmentRunning: true, alignmentProgress: { ratio: 0 } })
    try {
      const service: AlignmentService = createDefaultAlignmentService()
      const results = await service.align(audioBuffer, project.lines, (progress) =>
        set({ alignmentProgress: progress }),
      )
      get().applyAlignmentResults(results)
    } finally {
      set({ alignmentRunning: false })
    }
  },

  tapManualTiming: (time: number) => {
    const { project, manualPointer, manualClosed } = get()
    const syllables = flattenSyllables(project.lines)
    const n = syllables.length
    if (n === 0) return

    if (manualPointer < n) {
      const results: AlignmentTimingResult[] = [
        { syllableId: syllables[manualPointer].id, start: time, end: syllables[manualPointer].end ?? time + 0.4 },
      ]
      if (manualPointer > 0) {
        const prev = syllables[manualPointer - 1]
        results.push({ syllableId: prev.id, start: prev.start ?? time, end: time })
      }
      const lines = applyResultsToLines(project.lines, results)
      const nextPointer = manualPointer + 1
      set({
        project: { ...project, lines, updatedAt: new Date().toISOString() },
        manualPointer: nextPointer,
        manualClosed: nextPointer < n ? true : false,
      })
    } else if (manualPointer === n && !manualClosed) {
      const last = syllables[n - 1]
      const lines = updateSyllableInLines(project.lines, last.id, { end: time })
      set({
        project: { ...project, lines, updatedAt: new Date().toISOString() },
        manualClosed: true,
      })
    }
  },

  undoManualTiming: () => {
    const { project, manualPointer, manualClosed } = get()
    const syllables = flattenSyllables(project.lines)
    const n = syllables.length
    if (n === 0) return

    if (manualPointer === n && manualClosed) {
      const last = syllables[n - 1]
      const lines = updateSyllableInLines(project.lines, last.id, { end: null })
      set({ project: { ...project, lines }, manualClosed: false })
    } else if (manualPointer > 0) {
      const prevIndex = manualPointer - 1
      const target = syllables[prevIndex]
      let lines = updateSyllableInLines(project.lines, target.id, { start: null, end: null })
      if (prevIndex > 0) {
        const beforeTarget = syllables[prevIndex - 1]
        lines = updateSyllableInLines(lines, beforeTarget.id, { end: null })
      }
      set({
        project: { ...project, lines },
        manualPointer: prevIndex,
        manualClosed: true,
      })
    }
  },

  resetManualTiming: () => set({ manualPointer: 0, manualClosed: true }),

  setStyle: (patch) =>
    set((state) => ({
      project: {
        ...state.project,
        style: { ...state.project.style, ...patch },
        updatedAt: new Date().toISOString(),
      },
    })),

  setWavesurfer: (ws) => set({ wavesurfer: ws }),
  setCurrentTime: (t) => set({ currentTime: t }),
  setIsPlaying: (b) => set({ isPlaying: b }),
  togglePlay: () => {
    const ws = get().wavesurfer
    ws?.playPause()
  },
  seekTo: (t) => {
    const ws = get().wavesurfer
    if (!ws) return
    const duration = ws.getDuration()
    if (duration > 0) {
      ws.seekTo(Math.min(Math.max(t / duration, 0), 1))
    }
  },

  setView: (v) => set({ view: v }),
}))
