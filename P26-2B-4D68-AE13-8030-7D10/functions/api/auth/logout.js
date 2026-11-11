import { clearCookie, json, readJson, requestIsSafe } from "../../_lib/blog.js";

export async function onRequestPost({ request }) {
  if (!requestIsSafe(request)) return json({ ok: false, error: "Origem inválida." }, 403);
  if (!await readJson(request)) return json({ ok: false, error: "Requisição JSON inválida." }, 400);
  return json({ ok: true }, 200, { "Set-Cookie": clearCookie("discord_session", request) });
}
