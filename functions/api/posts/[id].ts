import type { Env } from '../../_lib/auth';
import { getSessionUser } from '../../_lib/auth';
import { jsonResponse, notFound, unauthorized } from '../../_lib/db';

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) return notFound();

  const post = await ctx.env.DB.prepare(
    `SELECT id, title, body, created_at, user_id, user_id as author_name
     FROM posts
     WHERE id = ?`
  )
    .bind(id)
    .first();

  if (!post) return notFound('게시글을 찾을 수 없습니다');

  const { results: comments } = await ctx.env.DB.prepare(
    `SELECT id, body, created_at, user_id as author_name
     FROM comments
     WHERE post_id = ?
     ORDER BY created_at ASC`
  )
    .bind(id)
    .all();

  return jsonResponse({ post, comments });
};

export const onRequestDelete: PagesFunction<Env> = async (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) return notFound();

  const user = await getSessionUser(ctx.request, ctx.env);
  if (!user) return unauthorized();

  const post = await ctx.env.DB.prepare('SELECT user_id FROM posts WHERE id = ?').bind(id).first<{ user_id: string }>();
  if (!post) return notFound('게시글을 찾을 수 없습니다');
  if (post.user_id !== user.id && !user.isAdmin) return unauthorized('작성자 또는 관리자만 삭제할 수 있습니다');

  await ctx.env.DB.prepare('DELETE FROM comments WHERE post_id = ?').bind(id).run();
  await ctx.env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();

  return jsonResponse({ ok: true });
};
