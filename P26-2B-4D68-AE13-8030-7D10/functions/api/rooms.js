import {
  errorResponse, getSession, json, readJson, requireDatabase, requestIsSafe,
} from "../_lib/blog.js";

export async function onRequestGet({ request, env }) {
  const unavailable = requireDatabase(env);
  if (unavailable) return unavailable;
  const user = await getSession(request, env.SESSION_SECRET);
  const result = await env.DB.prepare(`
    SELECT r.id, r.name, r.description, r.visibility, r.owner_id, r.created_at,
      EXISTS (SELECT 1 FROM room_members mine WHERE mine.room_id = r.id AND mine.user_id = ?) AS is_member,
      (SELECT COUNT(*) FROM room_members members WHERE members.room_id = r.id) AS member_count
    FROM rooms r
    WHERE r.visibility = 'public'
      OR r.owner_id = ?
      OR EXISTS (SELECT 1 FROM room_members mine WHERE mine.room_id = r.id AND mine.user_id = ?)
    ORDER BY CASE WHEN r.visibility = 'public' THEN 0 ELSE 1 END, r.name COLLATE NOCASE
    LIMIT 100
  `).bind(user?.userId || "", user?.userId || "", user?.userId || "").all();
  return json({ rooms: result.results || [] });
}

export async function onRequestPost({ request, env }) {
  if (!requestIsSafe(request)) return errorResponse("Origem inválida.", 403);
  const unavailable = requireDatabase(env);
  if (unavailable) return unavailable;
  const user = await getSession(request, env.SESSION_SECRET);
  if (!user) return errorResponse("Entre com Discord para criar uma sala.", 401);
  const body = await readJson(request);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const visibility = body?.visibility;
  if (name.length < 3 || name.length > 60) return errorResponse("O nome deve ter entre 3 e 60 caracteres.");
  if (description.length > 240) return errorResponse("A descrição aceita até 240 caracteres.");
  if (!["public", "private"].includes(visibility)) return errorResponse("Escolha uma sala pública ou privada.");

  const inviteCode = visibility === "private"
    ? Array.from(crypto.getRandomValues(new Uint8Array(18)), (byte) => byte.toString(16).padStart(2, "0")).join("")
    : null;
  const inviteHash = inviteCode ? await crypto.subtle.digest("SHA-256", new TextEncoder().encode(inviteCode)) : null;
  const encodedHash = inviteHash
    ? btoa(String.fromCharCode(...new Uint8Array(inviteHash)))
    : null;
  const result = await env.DB.prepare(
    "INSERT INTO rooms (owner_id, name, description, visibility, invite_hash) VALUES (?, ?, ?, ?, ?)",
  ).bind(user.userId, name, description, visibility, encodedHash).run();
  await env.DB.prepare("INSERT INTO room_members (room_id, user_id) VALUES (?, ?)")
    .bind(result.meta.last_row_id, user.userId).run();
  return json({ ok: true, id: result.meta.last_row_id, inviteCode }, 201);
}
