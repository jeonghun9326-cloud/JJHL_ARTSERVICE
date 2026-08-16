import type { LyricLine } from '../../types/project'
import { flattenSyllables } from '../lyricsParser'
import type { AlignmentProgress, AlignmentService, AlignmentTimingResult } from '../AlignmentService'
import { tokenWeight } from './distribute'

interface VoicedSegment {
  start: number
  end: number
}

const FRAME_SIZE = 2048
const HOP_SIZE = 512
const SMOOTHING_WINDOW = 5
const MERGE_GAP_SEC = 0.15
const MIN_SEGMENT_SEC = 0.08

function toMonoChannel(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) {
    return buffer.getChannelData(0)
  }
  const length = buffer.length
  const mono = new Float32Array(length)
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      mono[i] += data[i] / buffer.numberOfChannels
    }
  }
  return mono
}

function computeRmsFrames(mono: Float32Array): number[] {
  const frames: number[] = []
  for (let i = 0; i + FRAME_SIZE <= mono.length; i += HOP_SIZE) {
    let sumSquares = 0
    for (let j = 0; j < FRAME_SIZE; j++) {
      const v = mono[i + j]
      sumSquares += v * v
    }
    frames.push(Math.sqrt(sumSquares / FRAME_SIZE))
  }
  return frames
}

function smooth(values: number[], windowSize: number): number[] {
  const result: number[] = new Array(values.length)
  const half = Math.floor(windowSize / 2)
  for (let i = 0; i < values.length; i++) {
    let sum = 0
    let count = 0
    for (let j = i - half; j <= i + half; j++) {
      if (j >= 0 && j < values.length) {
        sum += values[j]
        count++
      }
    }
    result[i] = sum / count
  }
  return result
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / (values.length || 1)
}

function stdDev(values: number[], avg: number): number {
  const variance = values.reduce((a, b) => a + (b - avg) ** 2, 0) / (values.length || 1)
  return Math.sqrt(variance)
}

/** RMS 에너지 프레임으로부터 "발성 가능성이 높은" 구간을 추출한다. */
function detectVoicedSegments(mono: Float32Array, sampleRate: number): VoicedSegment[] {
  const rawRms = computeRmsFrames(mono)
  const rms = smooth(rawRms, SMOOTHING_WINDOW)

  const avg = mean(rms)
  const std = stdDev(rms, avg)
  const threshold = avg + std * 0.4

  const segments: VoicedSegment[] = []
  let segStartFrame: number | null = null

  for (let i = 0; i < rms.length; i++) {
    const active = rms[i] > threshold
    if (active && segStartFrame === null) {
      segStartFrame = i
    } else if (!active && segStartFrame !== null) {
      segments.push({
        start: (segStartFrame * HOP_SIZE) / sampleRate,
        end: (i * HOP_SIZE) / sampleRate,
      })
      segStartFrame = null
    }
  }
  if (segStartFrame !== null) {
    segments.push({
      start: (segStartFrame * HOP_SIZE) / sampleRate,
      end: (rms.length * HOP_SIZE) / sampleRate,
    })
  }

  // 짧은 무음 간격으로 나뉜 구간들을 하나로 병합
  const merged: VoicedSegment[] = []
  for (const seg of segments) {
    const last = merged[merged.length - 1]
    if (last && seg.start - last.end < MERGE_GAP_SEC) {
      last.end = seg.end
    } else {
      merged.push({ ...seg })
    }
  }

  // 너무 짧은(노이즈성) 구간 제거
  return merged.filter((seg) => seg.end - seg.start >= MIN_SEGMENT_SEC)
}

/**
 * MVP용 휴리스틱 정렬 스텁.
 *
 * 실제 음소 인식 기반 Forced Alignment가 아니라, 파형의 RMS 에너지로 "발성 구간"을 찾고
 * 그 구간들 안에 가사 음절을 순서대로 글자수 비례 배분하는 방식이다.
 * 보컬 구간과 반주가 겹치는 경우 등 실제 음성 인식이 필요한 케이스는 다루지 못하므로,
 * 결과는 반드시 사용자가 파형 화면에서 검수/수정하는 것을 전제로 한다.
 */
export class EnergyBasedAlignmentService implements AlignmentService {
  readonly id = 'energy-heuristic'
  readonly displayName = '파형 에너지 기반 추정 (휴리스틱)'
  readonly isForcedAlignment = false

  async align(
    audioBuffer: AudioBuffer,
    lines: LyricLine[],
    onProgress?: (progress: AlignmentProgress) => void,
  ): Promise<AlignmentTimingResult[]> {
    onProgress?.({ ratio: 0.05, message: '오디오 분석 준비 중...' })

    const mono = toMonoChannel(audioBuffer)
    onProgress?.({ ratio: 0.2, message: '음량 에너지 계산 중...' })

    const segments = detectVoicedSegments(mono, audioBuffer.sampleRate)
    onProgress?.({ ratio: 0.5, message: '발성 구간 탐지 완료, 음절 배분 중...' })

    const syllables = flattenSyllables(lines)
    if (syllables.length === 0 || segments.length === 0) {
      onProgress?.({ ratio: 1, message: '정렬할 대상이 없습니다.' })
      return []
    }

    const totalWeight = syllables.reduce((sum, s) => sum + tokenWeight(s.text), 0)
    const totalVoicedDuration = segments.reduce((sum, s) => sum + (s.end - s.start), 0)

    const results: AlignmentTimingResult[] = []

    let segIndex = 0
    let cursor = segments[0].start

    for (const syl of syllables) {
      const weight = tokenWeight(syl.text)
      let remaining = (weight / totalWeight) * totalVoicedDuration
      const start = cursor

      while (remaining > 0 && segIndex < segments.length) {
        const segEnd = segments[segIndex].end
        const availableInSeg = segEnd - cursor
        if (availableInSeg >= remaining) {
          cursor += remaining
          remaining = 0
        } else {
          remaining -= availableInSeg
          segIndex += 1
          cursor = segIndex < segments.length ? segments[segIndex].start : segEnd
        }
      }

      results.push({ syllableId: syl.id, start, end: Math.max(cursor, start + 0.05) })
    }

    onProgress?.({ ratio: 1, message: '완료' })
    return results
  }
}

export function createDefaultAlignmentService(): AlignmentService {
  return new EnergyBasedAlignmentService()
}
