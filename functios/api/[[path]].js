import worker from "../../src/worker.js";

// Jalankan router API yang sama sebagai Cloudflare Pages Function.
// Semua endpoint /api/* sekarang berada pada domain Pages yang sama.
export async function onRequest(context) {
  return worker.fetch(context.request, context.env);
}
