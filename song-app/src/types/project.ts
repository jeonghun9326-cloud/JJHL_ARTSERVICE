// 프로젝트 전역 데이터 구조 정의
// 설계 원칙: 실제로 "발음되는" 한글 음절 단위를 기본 타이밍 단위로 삼는다.
// 공백/줄바꿈은 타이밍 대상이 아니며 lineIndex/syllableIndex로 구조만 유지한다.

export interface Syllable {
  /** 음절 고유 id (line-syllable 조합으로 생성, 안정적 매칭용) */
  id: string
  /** 화면에 표시되는 텍스트 (한글 음절 1자 또는 영문/숫자 묶음 토큰) */
  text: string
  /** 시작 시간(초). 아직 타이밍이 지정되지 않았으면 null */
  start: number | null
  /** 종료 시간(초). 아직 타이밍이 지정되지 않았으면 null */
  end: number | null
  /** 가사 줄 번호 (0-based) */
  lineIndex: number
  /** 해당 줄에서의 음절 순서 (0-based) */
  syllableIndex: number
  /** 원본 가사에서 이 음절 바로 뒤에 띄어쓰기가 있었는지 (미리보기/영상에서 단어 간격 복원용) */
  trailingSpace: boolean
}

export interface LyricLine {
  lineIndex: number
  /** 사용자가 입력한 원본 줄 텍스트 (공백 포함) */
  rawText: string
  syllables: Syllable[]
}

export interface SubtitleStyle {
  fontFamily: string
  fontSize: number
  /** 아직 부르지 않은 가사 색상 */
  baseColor: string
  /** 현재 부르고 있는(강조) 색상 */
  highlightColor: string
  /** 다음 줄 미리보기 색상 */
  upcomingColor: string
  backgroundColor: string
}

export const DEFAULT_STYLE: SubtitleStyle = {
  fontFamily: "'Pretendard', 'Malgun Gothic', sans-serif",
  fontSize: 56,
  baseColor: '#8b93a7',
  highlightColor: '#ffd23f',
  upcomingColor: '#5b6478',
  backgroundColor: '#0b0d12',
}

export interface AudioFileInfo {
  /** IndexedDB에 저장된 오디오 blob을 찾기 위한 키 */
  storageId: string
  fileName: string
  mimeType: string
  duration: number
  sizeBytes: number
}

export interface KaraokeProject {
  version: number
  projectName: string
  createdAt: string
  updatedAt: string
  audio: AudioFileInfo | null
  lyricsRaw: string
  lines: LyricLine[]
  style: SubtitleStyle
}

export function createEmptyProject(): KaraokeProject {
  const now = new Date().toISOString()
  return {
    version: 1,
    projectName: '새 프로젝트',
    createdAt: now,
    updatedAt: now,
    audio: null,
    lyricsRaw: '',
    lines: [],
    style: { ...DEFAULT_STYLE },
  }
}
