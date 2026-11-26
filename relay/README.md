# STAG rest-alert relay (optional, not yet deployed)

Why: an iPhone web app cannot beep or buzz when it is in the background or the screen is locked. A Home Screen web app can receive web push (iOS 16.4 and later), but something has to send the push at the right time. This tiny Cloudflare Worker does that.

What it sees: a push subscription address, an opaque id and a delay in seconds. The push is empty and the app's service worker shows a fixed "Rest is up" notification, so no workout or health data ever reaches the relay.

Status: written, not yet deployed or tested. Things still to verify when we deploy together:
- Durable Objects (SQLite-backed) are available on your Cloudflare plan.
- Apple's push service accepts the VAPID header as written.
- The notification reaches your Apple Watch as a tap, and its sound.
- Cancel (Ready tapped early) removes the pending alert.

## Deploy (about 20 minutes, one time)
1. Create a free Cloudflare account. Install Node (`brew install node`), then `npm i -g wrangler` and `wrangler login`.
2. Open `keygen.html` in a browser tab, click Generate, and keep the tab open.
3. In this `relay/` folder run, pasting values from the tab when asked:
   ```bash
   wrangler secret put VAPID_PRIVATE_JWK
   wrangler secret put VAPID_PUBLIC
   wrangler secret put RELAY_TOKEN
   wrangler secret put VAPID_SUBJECT    # mailto:you@example.com, a contact the push service can use
   wrangler deploy
   ```
4. In the app: Data & settings > Rest alerts: paste the Worker URL, the token and the public key, tap Save, then Enable alerts (allow notifications), then Test in 10 s and lock the phone.

Secrets live only in Cloudflare and in the app's local storage. Never commit them.
