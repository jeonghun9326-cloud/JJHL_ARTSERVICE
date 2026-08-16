import type { Env } from '../_lib/auth';
import { getSessionUser } from '../_lib/auth';
import { jsonResponse } from '../_lib/db';

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const user = await getSessionUser(ctx.request, ctx.env);
  return jsonResponse({ user });
};
