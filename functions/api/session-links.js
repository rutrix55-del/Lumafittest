// GET /api/session-links?session_id=cs_...
// Backs the "download now" buttons on thank-you.html. Stripe appends the
// Checkout Session id to the success URL; we look that session up with a
// server-side key, confirm it is complete and paid, and only then mint the
// same short-lived signed links the delivery email carries. Nothing here
// trusts the browser: a guessed or unpaid session id gets no links.
//
// Env: STRIPE_SECRET_KEY — use a RESTRICTED key (Checkout Sessions: read only),
//      never the full secret key. If it is missing the page falls back to
//      "check your inbox", so a half-finished deploy degrades, not breaks.
import { FILE_LABELS, mintLinks, sessionIsPaid } from '../utils/delivery.js';

const LINK_TTL_SEC = 72 * 60 * 60; // same lifetime as the emailed links
const SESSION_ID = /^cs_(live|test)_[A-Za-z0-9]{10,}$/;

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const id = url.searchParams.get('session_id') || '';
  if (!SESSION_ID.test(id)) return json(400, { ok: false, reason: 'bad_session' });
  if (!env.STRIPE_SECRET_KEY || !env.DOWNLOAD_SECRET) {
    return json(503, { ok: false, reason: 'unconfigured' });
  }

  let res;
  try {
    res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${id}`, {
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
    });
  } catch {
    return json(502, { ok: false, reason: 'stripe_unreachable' });
  }
  if (res.status === 404) return json(404, { ok: false, reason: 'not_found' });
  if (!res.ok) return json(502, { ok: false, reason: 'stripe_error' });

  let session;
  try { session = await res.json(); } catch { return json(502, { ok: false, reason: 'stripe_error' }); }
  if (!sessionIsPaid(session)) return json(402, { ok: false, reason: 'unpaid' });

  const nowSec = Math.floor(Date.now() / 1000);
  const exp = nowSec + LINK_TTL_SEC;
  const origin = env.SITE_ORIGIN || url.origin;
  const links = await mintLinks(origin, exp, env.DOWNLOAD_SECRET);

  return json(200, {
    ok: true,
    expires: exp,
    links: links.map(({ file, url: href }) => ({ file, label: FILE_LABELS[file] || file, url: href })),
  });
}
