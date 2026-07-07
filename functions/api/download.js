// GET /api/download?token=...
// Validates a signed, expiring token (minted by the webhook), then streams the
// matching file straight from the PRIVATE R2 bucket. The bucket itself is never
// public, so this endpoint is the only way to reach the PDFs — and only with a
// valid, unexpired token.
import { verifyToken } from '../utils/delivery.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const nowSec = Math.floor(Date.now() / 1000);

  const result = await verifyToken(token, env.DOWNLOAD_SECRET, nowSec);
  if (!result.ok) {
    const expired = result.reason === 'expired';
    return new Response(
      expired
        ? 'This download link has expired. Reply to your purchase email and we’ll send a fresh one.'
        : 'Invalid download link.',
      { status: expired ? 410 : 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  }

  const object = await env.PRODUCT_BUCKET.get(result.file);
  if (!object) return new Response('File not found.', { status: 404 });

  const headers = new Headers();
  // Carry over R2 metadata (etag etc.) then force a PDF download.
  if (typeof object.writeHttpMetadata === 'function') object.writeHttpMetadata(headers);
  headers.set('Content-Type', 'application/pdf');
  headers.set('Content-Disposition', `attachment; filename="${result.file}"`);
  headers.set('Cache-Control', 'no-store');
  return new Response(object.body, { headers });
}
