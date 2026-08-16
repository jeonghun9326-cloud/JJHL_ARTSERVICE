import type { Env } from '../../_lib/auth';
import { createAccount, createSession, sessionCookieHeader } from '../../_lib/auth';
import { jsonResponse, badRequest, validateId, validatePassword } from '../../_lib/db';

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  let body: { id?: string; password?: string };
  try {
    body = await ctx.request.json();
  } catch {
    return badRequest('잘못된 요청입니다');
  }

  let id: string;
  let password: string;
  try {
    id = validateId(body.id);
    password = validatePassword(body.password);
  } catch (e) {
    return badRequest((e as Error).message);
  }

  let user;
  try {
    user = await createAccount(ctx.env, id, password);
  } catch (e) {
    return jsonResponse({ error: '이미 사용 중인 아이디입니다' }, { status: 409 });
  }

  const token = await createSession(ctx.env, user.id);
  return jsonResponse({ user }, { headers: { 'Set-Cookie': sessionCookieHeader(token) } });
};
