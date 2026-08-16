function pad(n: number, len: number): string {
  return String(n).padStart(len, '0')
}

/** ASS 타임 포맷: H:MM:SS.cc (centisecond) */
export function formatAssTime(seconds: number): string {
  const totalCs = Math.max(0, Math.round(seconds * 100))
  const h = Math.floor(totalCs / 360_000)
  const m = Math.floor((totalCs % 360_000) / 6_000)
  const s = Math.floor((totalCs % 6_000) / 100)
  const cs = totalCs % 100
  return `${h}:${pad(m, 2)}:${pad(s, 2)}.${pad(cs, 2)}`
}

/** '#rrggbb' -> ASS의 '&H00BBGGRR' (알파 00 = 불투명, BGR 순서) */
export function hexColorToAss(hex: string): string {
  const clean = hex.replace('#', '').padEnd(6, '0')
  const r = clean.slice(0, 2)
  const g = clean.slice(2, 4)
  const b = clean.slice(4, 6)
  return `&H00${b}${g}${r}`.toUpperCase()
}

/** ASS 오버라이드 블록으로 오인되지 않도록 중괄호를 제거한다 (가사에 등장할 일은 거의 없음). */
export function escapeAssText(text: string): string {
  return text.replace(/[{}]/g, '')
}
