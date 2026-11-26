// STAG rest-alert relay: a Cloudflare Worker plus one Durable Object per phone.
// It holds a push subscription and a timer, and sends an EMPTY Web Push when the timer fires.
// The phone's service worker shows a fixed "Rest is up" notification, so no workout or health
// data ever reaches this relay: only a subscription endpoint, an opaque id and a delay.
// Status: written but NOT yet deployed or tested. See relay/README.md.

const b64u = {
  enc: buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  encStr: s => b64u.enc(new TextEncoder().encode(s)),
};

async function vapidHeader(endpoint, env) {
  const aud = new URL(endpoint).origin;
  const head = b64u.encStr(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u.encStr(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT }));
  const key = await crypto.subtle.importKey('jwk', JSON.parse(env.VAPID_PRIVATE_JWK), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${head}.${claims}`));
  return `vapid t=${head}.${claims}.${b64u.enc(sig)}, k=${env.VAPID_PUBLIC}`;
}

async function sendPush(sub, env) {
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: { Authorization: await vapidHeader(sub.endpoint, env), TTL: '120', Urgency: 'high', 'Content-Length': '0' },
  });
  return res.status;
}

export class RestTimer {
  constructor(state, env) { this.state = state; this.env = env; }
  async fetch(req) {
    const path = new URL(req.url).pathname;
    const body = await req.json();
    if (path === '/schedule') {
      await this.state.storage.put('sub', body.subscription);
      await this.state.storage.setAlarm(Date.now() + Math.min(Math.max(body.delay_s, 1), 900) * 1000);
      return new Response('scheduled');
    }
    if (path === '/cancel') { await this.state.storage.deleteAlarm(); return new Response('cancelled'); }
    return new Response('not found', { status: 404 });
  }
  async alarm() {
    const sub = await this.state.storage.get('sub');
    if (sub) await sendPush(sub, this.env);
  }
}

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-token', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST' || req.headers.get('x-token') !== env.RELAY_TOKEN) return new Response('unauthorized', { status: 401, headers: cors });
    const path = new URL(req.url).pathname;
    if (path !== '/schedule' && path !== '/cancel') return new Response('not found', { status: 404, headers: cors });
    const body = await req.json();
    if (!body.id || (path === '/schedule' && !(body.subscription && body.subscription.endpoint))) return new Response('bad request', { status: 400, headers: cors });
    const stub = env.REST_TIMER.get(env.REST_TIMER.idFromName(String(body.id)));
    const r = await stub.fetch(new Request('https://do' + path, { method: 'POST', body: JSON.stringify(body) }));
    return new Response(await r.text(), { status: r.status, headers: cors });
  },
};
