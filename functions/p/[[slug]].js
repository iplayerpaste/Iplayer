// /p/:slug is a dedicated Pasteling reader. /p without a slug opens the create page.
export async function onRequest(context) {
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  const parts = new URL(context.request.url).pathname.split("/").filter(Boolean);
  const asset = parts.length > 1 ? "/paste-view.html" : "/paste.html";
  return context.env.ASSETS.fetch(new URL(asset, context.request.url));
}
