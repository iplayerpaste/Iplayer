// Admin sub-pages are served as assets while preserving the requested URL.
export async function onRequest(context) {
  const path = new URL(context.request.url).pathname;
  const asset = path === "/admin/videos" || path === "/admin/videos/"
    ? "/admin-videos.html"
    : "/admin.html";
  return context.env.ASSETS.fetch(new URL(asset, context.request.url));
}
