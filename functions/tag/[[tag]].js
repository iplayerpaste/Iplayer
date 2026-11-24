// Tag exploration uses the Paste Link application shell and preserves /tag/:name.
export async function onRequest(context) {
  return context.env.ASSETS.fetch(new URL("/paste.html", context.request.url));
}
