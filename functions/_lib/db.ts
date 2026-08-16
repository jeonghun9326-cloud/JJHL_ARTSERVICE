export const LIMITS = {
  TITLE_MAX: 200,
  BODY_MAX: 5000,
  COMMENT_MAX: 1000,
  ID_MIN: 2,
  ID_MAX: 20,
  PASSWORD_MIN: 4,
  PASSWORD_MAX: 100,
} as const;

const ID_PATTERN = /^[A-Za-z0-9_]+$/;

export function validateId(value: unknown): string {
  const id = validateText(value, LIMITS.ID_MAX, '아이디');
  if (id.length < LIMITS.ID_MIN) throw new Error(`아이디는 최소 ${LIMITS.ID_MIN}자 이상이어야 합니다`);
  if (!ID_PATTERN.test(id)) throw new Error('아이디는 영문, 숫자, 밑줄(_)만 사용할 수 있습니다');
  return id;
}

export function validatePassword(value: unknown): string {
  if (typeof value !== 'string') throw new Error('비밀번호가 필요합니다');
  if (value.length < LIMITS.PASSWORD_MIN) throw new Error(`비밀번호는 최소 ${LIMITS.PASSWORD_MIN}자 이상이어야 합니다`);
  if (value.length > LIMITS.PASSWORD_MAX) throw new Error(`비밀번호는 최대 ${LIMITS.PASSWORD_MAX}자까지 입력할 수 있습니다`);
  return value;
}

export function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(init.headers || {}) },
  });
}

export function badRequest(message: string): Response {
  return jsonResponse({ error: message }, { status: 400 });
}

export function unauthorized(message = '로그인이 필요합니다'): Response {
  return jsonResponse({ error: message }, { status: 401 });
}

export function notFound(message = '찾을 수 없습니다'): Response {
  return jsonResponse({ error: message }, { status: 404 });
}

export function validateText(value: unknown, maxLength: number, fieldName: string): string {
  if (typeof value !== 'string') throw new Error(`${fieldName}이(가) 필요합니다`);
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error(`${fieldName}을(를) 입력해주세요`);
  if (trimmed.length > maxLength) throw new Error(`${fieldName}은(는) 최대 ${maxLength}자까지 입력할 수 있습니다`);
  return trimmed;
}
