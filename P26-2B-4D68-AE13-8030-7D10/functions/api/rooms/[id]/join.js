import { errorResponse, isSameOrigin, json, readJson, requireDatabase } from "../../../_lib/http.js";
import { INVITE_CODE_PATTERN, hashInviteCode, resolveJoin } from "../../../_lib/rooms.js";
import { getSession } from "../../../_lib/session.js";
import { isPositiveId } from "../../../_lib/validation.js";

export async function onRequestPost({ request, env, params }) {
  if (!isSameOrigin(request)) return errorResponse("Origem inválida.", 403);
  const unavailable = requireDatabase(env);
  if (unavailable) return unavailable;

  const user = await getSession(request, env.SESSION_SECRET);
  if (!user) return errorResponse("Entre com Discord para entrar em uma sala.", 401);
  if (!isPositiveId(params.id)) return errorResponse("Sala não encontrada.", 404);

  const room = await env.DB.prepare("SELECT visibility, invite_hash, join_policy FROM rooms WHERE id = ?")
    .bind(params.id).first();
  if (!room) return errorResponse("Sala não encontrada.", 404);

  const member = await env.DB.prepare("SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?")
    .bind(params.id, user.userId).first();

  const blocked = await env.DB.prepare("SELECT 1 FROM room_blocks WHERE room_id = ? AND user_id = ?")
    .bind(params.id, user.userId).first();
  if (blocked && !member) return errorResponse("O dono removeu seu acesso a esta sala.", 403);

  let inviteMatches = room.visibility !== "private";
  if (room.visibility === "private" && !member) {
    const body = await readJson(request);
    const inviteCode = typeof body?.inviteCode === "string" ? body.inviteCode.trim() : "";
    inviteMatches = INVITE_CODE_PATTERN.test(inviteCode) && await hashInviteCode(inviteCode) === room.invite_hash;
  }

  const action = resolveJoin({
    isMember: Boolean(member),
    visibility: room.visibility,
    joinPolicy: room.join_policy,
    inviteMatches,
  });

  if (action === "denied") return errorResponse("Código de convite inválido.", 403);
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
