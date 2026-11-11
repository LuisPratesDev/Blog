import {
  errorResponse, getSession, json, readJson, requireDatabase, requestIsSafe, validId,
} from "../../../_lib/blog.js";

export async function onRequestPost({ request, env, params }) {
  if (!requestIsSafe(request)) return errorResponse("Origem inválida.", 403);
  const unavailable = requireDatabase(env);
  if (unavailable) return unavailable;
  const user = await getSession(request, env.SESSION_SECRET);
  if (!user) return errorResponse("Entre com Discord para entrar em uma sala.", 401);
  if (!validId(params.id)) return errorResponse("Sala não encontrada.", 404);
  const room = await env.DB.prepare("SELECT visibility, invite_hash FROM rooms WHERE id = ?")
    .bind(params.id).first();
  if (!room) return errorResponse("Sala não encontrada.", 404);
  const member = await env.DB.prepare("SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?")
    .bind(params.id, user.userId).first();
  if (member) return json({ ok: true, joined: true });

  if (room.visibility === "private") {
    const body = await readJson(request);
    const inviteCode = typeof body?.inviteCode === "string" ? body.inviteCode.trim() : "";
    if (!/^[a-f0-9]{36}$/.test(inviteCode)) return errorResponse("Código de convite inválido.", 403);
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(inviteCode));
    const encodedHash = btoa(String.fromCharCode(...new Uint8Array(hash)));
    if (encodedHash !== room.invite_hash) return errorResponse("Código de convite inválido.", 403);
  }

  await env.DB.prepare("INSERT INTO room_members (room_id, user_id) VALUES (?, ?)")
    .bind(params.id, user.userId).run();
  return json({ ok: true, joined: true });
}
