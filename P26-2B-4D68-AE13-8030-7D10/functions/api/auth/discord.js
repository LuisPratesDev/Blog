import { cookie, json } from "../../_lib/blog.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    return json({
      ok: false,
      error: "auth_not_configured",
      message: "Configure DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET e SESSION_SECRET (com pelo menos 32 caracteres) no Cloudflare Pages.",
    }, 503);
  }

  const stateBytes = crypto.getRandomValues(new Uint8Array(32));
  const state = Array.from(stateBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const redirectUri = new URL("/api/auth/discord/callback", url.origin).href;
  const authorizeUrl = new URL("https://discord.com/oauth2/authorize");
  authorizeUrl.searchParams.set("client_id", env.DISCORD_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "identify");
  authorizeUrl.searchParams.set("state", state);

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizeUrl.href,
      "Set-Cookie": cookie("discord_oauth_state", state, request, 600),
      "Cache-Control": "no-store",
    },
  });
}
