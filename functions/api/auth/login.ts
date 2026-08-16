import type { Env } from '../../_lib/auth';
import { verifyLogin, createSession, sessionCookieHeader } from '../../_lib/auth';
import { jsonResponse, badRequest } from '../../_lib/db';

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  let body: { id?: string; password?: string };
  try {
    body = await ctx.request.json();
  } catch {
    return badRequest('잘못된 요청입니다');
  }

  if (!body.id || !body.password) return badRequest('아이디와 비밀번호를 입력해주세요');

  const user = await verifyLogin(ctx.env, body.id, body.password);
  if (!user) {
    return jsonResponse({ error: '아이디 또는 비밀번호가 올바르지 않습니다' }, { status: 401 });
  }

  const token = await createSession(ctx.env, user.id);
  return jsonResponse({ user }, { headers: { 'Set-Cookie': sessionCookieHeader(token) } });
};
