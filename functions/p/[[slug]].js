// Dedicated Paste Link page route: /p/:slug.
// The browser URL remains /p/:slug; the app reads the slug from location.pathname.
export async function onRequest(context) {
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  return context.env.ASSETS.fetch(new URL("/paste.html", context.request.url));
}
