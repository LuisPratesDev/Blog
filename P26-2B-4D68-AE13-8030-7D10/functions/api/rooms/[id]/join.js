import { errorResponse, isSameOrigin, json, requireDatabase } from "../../../_lib/http.js";
import { resolveJoin } from "../../../_lib/rooms.js";
import { getSession } from "../../../_lib/session.js";
import { isPositiveId } from "../../../_lib/validation.js";

// Entrar em sala: pública é livre; privada usa apenas o ID da sala (sem código de convite).
// Quem o dono marcou como "somente aprovação" fica na fila de pedidos.
export async function onRequestPost({ request, env, params }) {
  if (!isSameOrigin(request)) return errorResponse("Origem inválida.", 403);
  const unavailable = requireDatabase(env);
  if (unavailable) return unavailable;

  const user = await getSession(request, env.SESSION_SECRET);
  if (!user) return errorResponse("Entre com Discord para entrar em uma sala.", 401);
  if (!isPositiveId(params.id)) return errorResponse("Sala não encontrada.", 404);

  const room = await env.DB.prepare("SELECT visibility, join_policy FROM rooms WHERE id = ?")
    .bind(params.id).first();
  if (!room) return errorResponse("Sala não encontrada.", 404);

  const member = await env.DB.prepare("SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?")
    .bind(params.id, user.userId).first();

  const blocked = await env.DB.prepare("SELECT 1 FROM room_blocks WHERE room_id = ? AND user_id = ?")
    .bind(params.id, user.userId).first();
  if (blocked && !member) return errorResponse("O dono removeu seu acesso a esta sala.", 403);

  const action = resolveJoin({
    isMember: Boolean(member),
    visibility: room.visibility,
    joinPolicy: room.join_policy,
  });

  if (action !== "pending") {
    if (action === "joined") {
      await env.DB.prepare("INSERT INTO room_members (room_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING")
        .bind(params.id, user.userId).run();
    }
    return json({ ok: true, joined: true });
  }

  await env.DB.prepare("INSERT INTO room_join_requests (room_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING")
    .bind(params.id, user.userId).run();
  return json({ ok: true, pending: true });
}
