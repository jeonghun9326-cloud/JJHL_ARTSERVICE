import type { Env } from '../../_lib/auth';
import { getSessionUser } from '../../_lib/auth';
import { jsonResponse, badRequest, unauthorized, validateText, LIMITS } from '../../_lib/db';

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const { results } = await ctx.env.DB.prepare(
    `SELECT id, title, created_at, user_id as author_name,
            (SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id) as comment_count
     FROM posts
     ORDER BY created_at DESC
     LIMIT 100`
  ).all();

  return jsonResponse({ posts: results });
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const user = await getSessionUser(ctx.request, ctx.env);
  if (!user) return unauthorized();

  let body: { title?: string; body?: string };
  try {
    body = await ctx.request.json();
  } catch {
    return badRequest('잘못된 요청입니다');
  }

  let title: string;
  let text: string;
  try {
    title = validateText(body.title, LIMITS.TITLE_MAX, '제목');
    text = validateText(body.body, LIMITS.BODY_MAX, '내용');
  } catch (e) {
    return badRequest((e as Error).message);
  }

  const now = Math.floor(Date.now() / 1000);
  const result = await ctx.env.DB.prepare(
    'INSERT INTO posts (user_id, title, body, created_at) VALUES (?, ?, ?, ?)'
  )
    .bind(user.id, title, text, now)
    .run();

  return jsonResponse(
    { id: result.meta.last_row_id, title, body: text, created_at: now, author_name: user.id },
    { status: 201 }
  );
};
