// Dedicated Video detail route: /v/:slug.
// Kept separate from /api/* and /p/* to prevent route collisions.
export async function onRequest(context) {
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  return context.env.ASSETS.fetch(new URL("/video.html", context.request.url));
}
