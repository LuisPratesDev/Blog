import {
  errorResponse, getSession, isRoomMember, json, readJson, requireDatabase, requestIsSafe, validId,
} from "../../../_lib/blog.js";

export async function onRequestGet({ request, env, params }) {
  const unavailable = requireDatabase(env);
  if (unavailable) return unavailable;
  if (!validId(params.id)) return errorResponse("Artigo não encontrado.", 404);
  const article = await env.DB.prepare("SELECT id, room_id FROM articles WHERE id = ?").bind(params.id).first();
  if (!article) return errorResponse("Artigo não encontrado.", 404);
  if (article.room_id) {
    const room = await env.DB.prepare("SELECT visibility FROM rooms WHERE id = ?").bind(article.room_id).first();
    const user = await getSession(request, env.SESSION_SECRET);
    if (room?.visibility === "private" && !await isRoomMember(env.DB, article.room_id, user?.userId)) {
      return errorResponse("Sala não encontrada.", 404);
    }
  }
  const result = await env.DB.prepare(`
    SELECT c.id, c.body, c.created_at, u.user_id AS author_id, u.username, u.avatar
    FROM comments c JOIN discord_users u ON u.user_id = c.author_id
    WHERE c.article_id = ?
    ORDER BY c.created_at ASC, c.id ASC
    LIMIT 200
  `).bind(params.id).all();
  return json({ comments: result.results || [] });
}

export async function onRequestPost({ request, env, params }) {
  if (!requestIsSafe(request)) return errorResponse("Origem inválida.", 403);
  const unavailable = requireDatabase(env);
  if (unavailable) return unavailable;
  const user = await getSession(request, env.SESSION_SECRET);
  if (!user) return errorResponse("Entre com Discord para comentar.", 401);
  if (!validId(params.id)) return errorResponse("Artigo não encontrado.", 404);
  const body = await readJson(request);
  const comment = typeof body?.body === "string" ? body.body.trim() : "";
  if (!comment || comment.length > 3000) return errorResponse("O comentário deve ter entre 1 e 3.000 caracteres.");
  const article = await env.DB.prepare("SELECT id, room_id FROM articles WHERE id = ?").bind(params.id).first();
  if (!article) return errorResponse("Artigo não encontrado.", 404);
  if (article.room_id) {
    const room = await env.DB.prepare("SELECT visibility FROM rooms WHERE id = ?").bind(article.room_id).first();
    if (room?.visibility === "private") {
      const membership = await env.DB.prepare("SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?")
        .bind(article.room_id, user.userId).first();
      if (!membership) return errorResponse("Você não participa desta sala.", 403);
    }
  }
  const result = await env.DB.prepare(
    "INSERT INTO comments (article_id, author_id, body) VALUES (?, ?, ?)",
  ).bind(params.id, user.userId, comment).run();
  return json({ ok: true, id: result.meta.last_row_id }, 201);
}
