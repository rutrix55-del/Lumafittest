// Shared crypto + delivery helpers for the LumaFit "Stripe → R2 → Resend" flow.
// Pure Web Crypto / Fetch — NO npm dependencies, so this bundles cleanly into a
// Cloudflare Pages Function with no build step. Imported by both Functions and the test.

// The ONLY files a buyer may ever download. An allowlist here means a tampered or
// hand-crafted token can never reach an arbitrary key in the R2 bucket.
export const FILES = ['guide.pdf', 'tracker.pdf', 'food-list.pdf'];

const enc = new TextEncoder();

// HMAC-SHA256 → lowercase hex.
export async function hmacHex(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Constant-time compare of two strings (avoids leaking the signature via timing).
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// URL-safe base64 (no padding) — for putting the token payload in a query string.
export function b64urlEncode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64urlDecode(str) {
  const pad = str.length % 4 ? '='.repeat(4 - (str.length % 4)) : '';
  return atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
}

// ── Download tokens ──────────────────────────────────────────────────────────
// token = b64url("file|expEpochSec") + "." + HMAC("file|expEpochSec")
// Unguessable (the HMAC can't be forged without DOWNLOAD_SECRET) and self-expiring
// (the expiry is part of the signed payload, so it can't be tampered with).
export async function makeToken(file, expSec, secret) {
  const payload = `${file}|${expSec}`;
  const sig = await hmacHex(secret, payload);
  return `${b64urlEncode(payload)}.${sig}`;
}

export async function verifyToken(token, secret, nowSec) {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return { ok: false, reason: 'malformed' };
  }
  const [b64, sig] = token.split('.');
  let payload;
  try { payload = b64urlDecode(b64); } catch { return { ok: false, reason: 'malformed' }; }
  const [file, expStr] = payload.split('|');
  const exp = Number(expStr);
  if (!FILES.includes(file) || !Number.isFinite(exp)) return { ok: false, reason: 'invalid' };
  const expected = await hmacHex(secret, payload);
  if (!timingSafeEqual(sig, expected)) return { ok: false, reason: 'badsig' };
  if (nowSec > exp) return { ok: false, reason: 'expired' };
  return { ok: true, file, exp };
}

// ── Stripe webhook signature ─────────────────────────────────────────────────
// Verifies the `Stripe-Signature` header exactly like stripe.webhooks.constructEvent,
// but with Web Crypto so it runs in the Workers runtime. Pass the RAW request body.
export async function verifyStripeSignature(rawBody, sigHeader, secret, nowSec, toleranceSec = 300) {
  if (!sigHeader || !secret) return false;
  let t;
  const v1s = [];
  for (const part of sigHeader.split(',')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === 't') t = v;
    else if (k === 'v1') v1s.push(v);
  }
  if (!t || v1s.length === 0) return false;
  // Reject replays / clock-skewed events outside the tolerance window.
  if (!Number.isFinite(Number(t)) || Math.abs(nowSec - Number(t)) > toleranceSec) return false;
  const expected = await hmacHex(secret, `${t}.${rawBody}`);
  return v1s.some((v) => timingSafeEqual(v, expected));
}

// ── Email ────────────────────────────────────────────────────────────────────
export function buildEmail(links) {
  const labels = {
    'guide.pdf': 'The LumaFit Guide',
    'tracker.pdf': 'Your 30-Day Tracker',
    'food-list.pdf': 'The Skin Reset Food List',
  };
  const rows = links.map(({ file, url }) => `
    <tr><td style="padding:8px 0;">
      <a href="${url}" style="display:inline-block;background:#1f9d6b;color:#ffffff;text-decoration:none;
         padding:13px 24px;border-radius:10px;font-weight:600;font-size:15px;">
        Download ${labels[file] || file} &darr;
      </a>
    </td></tr>`).join('');
  return `<!doctype html><html><body style="margin:0;background:#f4f7f5;
    font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#16241d;">
    <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
      <h1 style="font-size:22px;margin:0 0 6px;">Welcome to LumaFit &#127807;</h1>
      <p style="font-size:15px;line-height:1.6;color:#3c4a43;margin:0 0 18px;">
        Thanks for your purchase! Here are your three downloads. Tip: start with the
        Skin Reset food list, then open the main guide.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">${rows}</table>
      <p style="font-size:13px;line-height:1.6;color:#6b7b72;margin:22px 0 0;">
        These links expire in 72 hours for your security &mdash; please download and save the files.
        Need a fresh link or any help at all? Just reply to this email.
      </p>
    </div></body></html>`;
}

// Sends the download email via Resend's REST API. Returns {ok, status, body}.
export async function sendViaResend(env, to, links) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL || 'LumaFit <hello@lumafit.org>',
      to,
      subject: 'Your LumaFit downloads are here \u{1F33F}',
      html: buildEmail(links),
    }),
  });
  return { ok: res.ok, status: res.status, body: await res.text().catch(() => '') };
}
