import { openDB, type IDBPDatabase } from 'idb'
import type { KaraokeProject } from '../types/project'
import { sanitizeFileName } from '../utils/fileName'

const DB_NAME = 'karaoke-subtitle-maker'
const DB_VERSION = 1
const AUDIO_STORE = 'audio-blobs'

let dbPromise: Promise<IDBPDatabase> | null = null

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(AUDIO_STORE)) {
          db.createObjectStore(AUDIO_STORE)
        }
      },
    })
  }
  return dbPromise
}

export function generateStorageId(): string {
  return `audio-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export async function saveAudioBlob(storageId: string, blob: Blob): Promise<void> {
  const db = await getDb()
  await db.put(AUDIO_STORE, blob, storageId)
}

export async function loadAudioBlob(storageId: string): Promise<Blob | undefined> {
  const db = await getDb()
  return db.get(AUDIO_STORE, storageId)
}

export async function deleteAudioBlob(storageId: string): Promise<void> {
  const db = await getDb()
  await db.delete(AUDIO_STORE, storageId)
}

/** 프로젝트를 JSON 문자열로 직렬화한다 (오디오 바이너리는 포함하지 않음). */
export function serializeProject(project: KaraokeProject): string {
  return JSON.stringify(project, null, 2)
}

export function deserializeProject(json: string): KaraokeProject {
  const parsed = JSON.parse(json) as KaraokeProject
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.lines)) {
    throw new Error('올바르지 않은 프로젝트 파일 형식입니다.')
  }
  return parsed
}

/** 프로젝트 JSON을 파일로 다운로드한다 (브라우저 전용, 로컬 PC의 다운로드 폴더에 저장됨). */
export function downloadProjectFile(project: KaraokeProject): void {
  const json = serializeProject(project)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${sanitizeFileName(project.projectName, 'project')}.karaoke.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function readFileAsText(file: File): Promise<string> {
  return await file.text()
}
