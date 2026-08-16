import type { Env } from '../../_lib/auth';
import { destroySession, clearSessionCookieHeader } from '../../_lib/auth';
import { jsonResponse } from '../../_lib/db';

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const cookie = ctx.request.headers.get('Cookie') || '';
  const match = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  if (match) {
    await destroySession(ctx.env, decodeURIComponent(match[1]));
  }
  return jsonResponse({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookieHeader() } });
};
