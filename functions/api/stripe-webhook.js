// POST /api/stripe-webhook
// Stripe calls this after every completed checkout. We verify the signature, then
// email the buyer three short-lived, signed download links. Files live in a PRIVATE
// R2 bucket (binding: PRODUCT_BUCKET) and are streamed by /api/download — they are
// never exposed publicly and never shipped with the static site.
import { FILES, makeToken, verifyStripeSignature, sendViaResend } from '../utils/delivery.js';

const LINK_TTL_SEC = 72 * 60 * 60; // download links valid for 72 hours

export async function onRequestPost({ request, env }) {
  // 1. Read the RAW body — signature verification must run on the exact bytes Stripe
  //    signed, so do NOT JSON.parse before verifying.
  const rawBody = await request.text();
  const sig = request.headers.get('Stripe-Signature');
  const nowSec = Math.floor(Date.now() / 1000);

  if (!(await verifyStripeSignature(rawBody, sig, env.STRIPE_WEBHOOK_SECRET, nowSec))) {
    // 400 → Stripe shows the delivery as failed (and will retry) but never trusts it.
    return new Response('Invalid signature', { status: 400 });
  }

  let event;
  try { event = JSON.parse(rawBody); } catch { return new Response('Bad JSON', { status: 400 }); }

  // Only fulfil a completed, paid checkout. Everything else gets a 200 so Stripe
  // stops retrying it.
  if (event.type !== 'checkout.session.completed') {
    return new Response('Ignored', { status: 200 });
  }
  const session = event.data?.object || {};
  if (session.payment_status && session.payment_status !== 'paid') {
    return new Response('Not paid', { status: 200 });
  }
  const email = session.customer_details?.email || session.customer_email;
  if (!email) return new Response('No customer email', { status: 200 });

  // 2. Idempotency — Stripe retries on any non-2xx (and occasionally otherwise).
  //    If a DEDUPE KV namespace is bound, skip sessions we've already fulfilled.
  if (env.DEDUPE && (await env.DEDUPE.get(session.id))) {
    return new Response('Already fulfilled', { status: 200 });
  }

  // 3. Mint one expiring, signed link per file.
  const origin = env.SITE_ORIGIN || new URL(request.url).origin;
  const exp = nowSec + LINK_TTL_SEC;
  const links = await Promise.all(
    FILES.map(async (file) => ({
      file,
      url: `${origin}/api/download?token=${await makeToken(file, exp, env.DOWNLOAD_SECRET)}`,
    })),
  );

  // 4. Email them. On failure return 500 so Stripe retries the webhook later.
  const sent = await sendViaResend(env, email, links);
  if (!sent.ok) {
    console.error('Resend send failed', sent.status, sent.body);
    return new Response('Email send failed', { status: 500 });
  }

  if (env.DEDUPE) {
    await env.DEDUPE.put(session.id, '1', { expirationTtl: 7 * 24 * 60 * 60 });
  }
  return new Response('OK', { status: 200 });
}
