import { getSession, json } from "../../_lib/blog.js";

export async function onRequestGet({ request, env }) {
  return json({ user: await getSession(request, env.SESSION_SECRET) });
}
