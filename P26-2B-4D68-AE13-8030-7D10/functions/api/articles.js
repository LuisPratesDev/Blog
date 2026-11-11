import {
  canViewRoom, errorResponse, getSession, json, readJson, requireDatabase,
  requestIsSafe,
} from "../_lib/blog.js";

export async function onRequestGet({ request, env }) {
  const unavailable = requireDatabase(env);
  if (unavailable) return unavailable;
  const url = new URL(request.url);
  const session = await getSession(request, env.SESSION_SECRET);
  const conditions = [];
  const values = [];

  if (url.searchParams.has("author")) {
    const authorId = url.searchParams.get("author");
    if (!authorId || authorId.length > 64) return errorResponse("Autor inválido.");
    conditions.push("a.author_id = ?");
    values.push(authorId);
  }
  if (url.searchParams.has("room")) {
    const roomId = Number(url.searchParams.get("room"));
    if (!Number.isSafeInteger(roomId) || roomId < 1) return errorResponse("Sala inválida.");
    if (!await canViewRoom(env.DB, roomId, session?.userId)) return errorResponse("Sala não encontrada.", 404);
    conditions.push("a.room_id = ?");
    values.push(roomId);
  } else {
    conditions.push("(a.room_id IS NULL OR EXISTS (SELECT 1 FROM rooms visible_room WHERE visible_room.id = a.room_id AND visible_room.visibility = 'public') OR EXISTS (SELECT 1 FROM room_members rm WHERE rm.room_id = a.room_id AND rm.user_id = ?))");
    values.push(session?.userId || "");
  }

  const result = await env.DB.prepare(`
    SELECT a.id, a.title, a.body, a.author_id, a.room_id, a.created_at, a.updated_at,
      u.username AS author_name, u.avatar AS author_avatar,
      r.name AS room_name, r.visibility AS room_visibility,
      (SELECT COUNT(*) FROM article_likes l WHERE l.article_id = a.id) AS like_count,
      (SELECT COUNT(*) FROM comments c WHERE c.article_id = a.id) AS comment_count,
      EXISTS (SELECT 1 FROM article_likes mine WHERE mine.article_id = a.id AND mine.user_id = ?) AS liked
    FROM articles a
    JOIN discord_users u ON u.user_id = a.author_id
    LEFT JOIN rooms r ON r.id = a.room_id
    WHERE ${conditions.join(" AND ")}
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT 100
  `).bind(session?.userId || "", ...values).all();
  return json({ articles: result.results || [] });
}

export async function onRequestPost({ request, env }) {
  if (!requestIsSafe(request)) return errorResponse("Origem inválida.", 403);
  const unavailable = requireDatabase(env);
  if (unavailable) return unavailable;
  const user = await getSession(request, env.SESSION_SECRET);
  if (!user) return errorResponse("Entre com Discord para publicar.", 401);
  const body = await readJson(request);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const content = typeof body?.body === "string" ? body.body.trim() : "";
  const roomId = body?.roomId === "" || body?.roomId == null ? null : Number(body.roomId);
  if (title.length < 3 || title.length > 140) return errorResponse("O título deve ter entre 3 e 140 caracteres.");
  if (content.length < 1 || content.length > 50000) return errorResponse("O artigo deve ter entre 1 e 50.000 caracteres.");
  if (roomId !== null && (!Number.isSafeInteger(roomId) || roomId < 1)) return errorResponse("Sala inválida.");
  if (roomId !== null && !await canViewRoom(env.DB, roomId, user.userId)) return errorResponse("Você não participa desta sala.", 403);

  const result = await env.DB.prepare(
    "INSERT INTO articles (author_id, title, body, room_id) VALUES (?, ?, ?, ?)",
  ).bind(user.userId, title, content, roomId).run();
  return json({ ok: true, id: result.meta.last_row_id }, 201);
}
