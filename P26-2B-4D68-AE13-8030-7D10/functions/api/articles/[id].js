import {
  canViewRoom, errorResponse, getSession, json, readJson, requireDatabase,
  requestIsSafe, validId,
} from "../../_lib/blog.js";

export async function onRequestPut({ request, env, params }) {
  if (!requestIsSafe(request)) return errorResponse("Origem inválida.", 403);
  const unavailable = requireDatabase(env);
  if (unavailable) return unavailable;
  const user = await getSession(request, env.SESSION_SECRET);
  if (!user) return errorResponse("Entre com Discord para editar.", 401);
  if (!validId(params.id)) return errorResponse("Artigo não encontrado.", 404);
  const body = await readJson(request);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const content = typeof body?.body === "string" ? body.body.trim() : "";
  const roomId = body?.roomId === "" || body?.roomId == null ? null : Number(body.roomId);
  if (title.length < 3 || title.length > 140) return errorResponse("O título deve ter entre 3 e 140 caracteres.");
  if (content.length < 1 || content.length > 50000) return errorResponse("O artigo deve ter entre 1 e 50.000 caracteres.");
  if (roomId !== null && (!Number.isSafeInteger(roomId) || roomId < 1)) return errorResponse("Sala inválida.");
  if (roomId !== null && !await canViewRoom(env.DB, roomId, user.userId)) return errorResponse("Você não participa desta sala.", 403);
  const result = await env.DB.prepare(
    "UPDATE articles SET title = ?, body = ?, room_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND author_id = ?",
  ).bind(title, content, roomId, params.id, user.userId).run();
  if (!result.meta.changes) return errorResponse("Artigo não encontrado ou sem permissão.", 404);
  return json({ ok: true });
}

export async function onRequestDelete({ request, env, params }) {
  if (!requestIsSafe(request)) return errorResponse("Origem inválida.", 403);
  const unavailable = requireDatabase(env);
  if (unavailable) return unavailable;
  const user = await getSession(request, env.SESSION_SECRET);
  if (!user) return errorResponse("Entre com Discord para excluir.", 401);
  if (!validId(params.id)) return errorResponse("Artigo não encontrado.", 404);
  const result = await env.DB.prepare(
    "DELETE FROM articles WHERE id = ? AND author_id = ?",
  ).bind(params.id, user.userId).run();
  if (!result.meta.changes) return errorResponse("Artigo não encontrado ou sem permissão.", 404);
  return json({ ok: true });
}
