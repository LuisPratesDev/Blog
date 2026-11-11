import {
  errorResponse, getSession, json, requireDatabase, requestIsSafe, validId,
} from "../../../_lib/blog.js";

export async function onRequestPost({ request, env, params }) {
  if (!requestIsSafe(request)) return errorResponse("Origem inválida.", 403);
  const unavailable = requireDatabase(env);
  if (unavailable) return unavailable;
  const user = await getSession(request, env.SESSION_SECRET);
  if (!user) return errorResponse("Entre com Discord para curtir.", 401);
  if (!validId(params.id)) return errorResponse("Artigo não encontrado.", 404);
  const article = await env.DB.prepare("SELECT id, room_id FROM articles WHERE id = ?").bind(params.id).first();
  if (!article) return errorResponse("Artigo não encontrado.", 404);
  if (article.room_id) {
    const room = await env.DB.prepare("SELECT visibility FROM rooms WHERE id = ?").bind(article.room_id).first();
    if (room?.visibility === "private") {
      const member = await env.DB.prepare("SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?")
        .bind(article.room_id, user.userId).first();
      if (!member) return errorResponse("Você não participa desta sala.", 403);
    }
  }
  const existing = await env.DB.prepare(
    "SELECT 1 FROM article_likes WHERE article_id = ? AND user_id = ?",
  ).bind(params.id, user.userId).first();
  if (existing) {
    await env.DB.prepare("DELETE FROM article_likes WHERE article_id = ? AND user_id = ?")
      .bind(params.id, user.userId).run();
  } else {
    await env.DB.prepare("INSERT INTO article_likes (article_id, user_id) VALUES (?, ?)")
      .bind(params.id, user.userId).run();
  }
  const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM article_likes WHERE article_id = ?")
    .bind(params.id).first();
  return json({ ok: true, liked: !existing, count: Number(count?.count || 0) });
}
