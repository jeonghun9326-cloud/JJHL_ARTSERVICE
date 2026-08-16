import type { Env } from '../../../_lib/auth';
import { getSessionUser } from '../../../_lib/auth';
import { jsonResponse, badRequest, unauthorized, notFound, validateText, LIMITS } from '../../../_lib/db';

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const postId = Number(ctx.params.id);
  if (!Number.isInteger(postId)) return notFound();

  const user = await getSessionUser(ctx.request, ctx.env);
  if (!user) return unauthorized();

  const post = await ctx.env.DB.prepare('SELECT id FROM posts WHERE id = ?').bind(postId).first();
  if (!post) return notFound('게시글을 찾을 수 없습니다');

  let body: { body?: string };
  try {
    body = await ctx.request.json();
  } catch {
    return badRequest('잘못된 요청입니다');
  }

  let text: string;
  try {
    text = validateText(body.body, LIMITS.COMMENT_MAX, '댓글');
  } catch (e) {
    return badRequest((e as Error).message);
  }

  const now = Math.floor(Date.now() / 1000);
  const result = await ctx.env.DB.prepare(
    'INSERT INTO comments (post_id, user_id, body, created_at) VALUES (?, ?, ?, ?)'
  )
    .bind(postId, user.id, text, now)
    .run();

  return jsonResponse(
    { id: result.meta.last_row_id, body: text, created_at: now, author_name: user.id },
    { status: 201 }
  );
};
