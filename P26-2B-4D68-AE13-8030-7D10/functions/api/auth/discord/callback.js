import { cookie, json, signSession } from "../../../_lib/blog.js";

function stateCookie(request, state, maxAge = 0) {
  return cookie("discord_oauth_state", state, request, maxAge);
}

function authFailure(request, error, status = 400) {
  return json({ ok: false, error }, status, {
    "Set-Cookie": stateCookie(request, ""),
    "Cache-Control": "no-store",
  });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  const oauthCookie = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)discord_oauth_state=([^;]+)/)?.[1] || "";
  if (url.searchParams.has("error")) return authFailure(request, "discord_authorization_denied");
  if (!state || !oauthCookie || state !== oauthCookie || !code) return authFailure(request, "invalid_oauth_state");
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    return authFailure(request, "auth_not_configured", 503);
  }
  if (!env.DB) return authFailure(request, "database_unavailable", 503);

  const redirectUri = new URL("/api/auth/discord/callback", url.origin).href;
  try {
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenResponse.ok) return authFailure(request, "token_exchange_failed");
    const token = await tokenResponse.json();
    if (typeof token.access_token !== "string") return authFailure(request, "token_exchange_failed");

    const profileResponse = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!profileResponse.ok) return authFailure(request, "profile_fetch_failed");
    const profile = await profileResponse.json();
    if (!/^\d{1,64}$/.test(String(profile.id || "")) || typeof profile.username !== "string") {
      return authFailure(request, "invalid_discord_profile");
    }

    const user = {
      userId: String(profile.id),
      username: String(profile.global_name || profile.username).slice(0, 80),
      avatar: profile.avatar
        ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
        : "https://cdn.discordapp.com/embed/avatars/0.png",
    };
    await env.DB.prepare(`
      INSERT INTO discord_users (user_id, username, avatar, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        username = excluded.username, avatar = excluded.avatar, updated_at = CURRENT_TIMESTAMP
    `).bind(user.userId, user.username, user.avatar).run();

    const session = await signSession(user, env.SESSION_SECRET);
    const secure = url.protocol === "https:" ? "; Secure" : "";
    const headers = new Headers({
      Location: "/",
      "Cache-Control": "no-store",
    });
    headers.append("Set-Cookie", `discord_session=${session}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secure}`);
    headers.append("Set-Cookie", stateCookie(request, ""));
    return new Response(null, {
      status: 302,
      headers,
    });
  } catch {
    return authFailure(request, "authentication_failed", 502);
  }
}
