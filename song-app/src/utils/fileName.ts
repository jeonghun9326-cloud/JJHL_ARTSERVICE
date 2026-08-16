export function sanitizeFileName(name: string, fallback = 'file'): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || fallback
}
