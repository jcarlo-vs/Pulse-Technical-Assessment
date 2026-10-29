# Pulse - Notes

**Live:** https://juan-carlo-senin-pulse-letsgo.vercel.app
**Repo:** https://github.com/jcarlo-vs/Pulse-Technical-Assessment

**Try it with two people:** open the live link in two windows (a normal window and an incognito one). In each, DevTools > Sensors > Location sets a different place, or just allow your real location. Pick a vibe in each, drop in, then use **Find someone** (or tap a dot) and accept in the other window. On a phone it works over the live HTTPS link; location, camera and mic all need HTTPS.

---

## Phase 1 - Make it run

I reproduced each symptom in two windows, read the code path behind it, fixed it, and re-tested. One commit per bug.

| # | What was broken | How I found it | Fix |
|---|---|---|---|
| 1 | **Ghost dots** (the example): dots stayed long after people left | Closed one window; its dot never left. `/api/poll`'s heartbeat `updateMany` had no `where`, so every poll refreshed *every* row and nothing ever went stale | Heartbeat only the caller's row |
| 2 | **Chat never arrived** | Messages showed for the sender only. The sender tagged `{t:"msg"}`, the receiver only accepted `"chat"` | Use one message type |
| 3 | **Peers often never connected** | Connections stalled at "Connecting…". Tracing `handleSignal`: early ICE candidates were queued, but the queue was flushed *before* `setRemoteDescription`, so `addIceCandidate` threw and the empty `catch` swallowed it | Flush after the remote description is set |
| 4 | **Everyone became "busy" forever** after one chat | Second connection attempt was auto-declined. Only `decline` cleared `busy`; `end` didn't | Clear busy on end |
| 5 | **Partner's chat hung** when the other closed the tab | Closed a tab mid-chat; the other side stayed connected and busy | Hang up on `pagehide`; the server ends the pairing on leave |
| 6 | **Users silently vanished** from the map | Left a tab in the background; timers are throttled, the row got reaped and was never re-created | `/api/poll` returns 410 for a reaped session; the client re-joins (with the *same* offset, see Phase 3) |
| 7 | **Blank map** with no explanation when the token was missing | A hardcoded fake Mapbox token hid the built-in setup message | Removed the fake fallback |

---

## Phase 2 - Make it good

**The goal:** the first thing you see should be the product (a living planet), not a form. Every screen should feel calm, safe and a little magical.

- **Entry: "globe + how it works".** The live globe spins on the left; the right panel *is* the onboarding: (1) pick your vibe, (2) who you'd like to talk to, (3) drop in. The button follows your choice ("🎧 Drop in for music"). On wide screens the two stay together as one centered pair; on phones the panel becomes a compact bottom sheet.
- **A globe that looks alive.** Mapbox globe projection with atmosphere and stars. The layers are recolored per theme (no stock grey ball), there's an idle spin, and it flies down to you on join. Before you even join, it shows **real live activity**: available (ping), in a call (two orbiting dots), waiting for an answer (blink), with counts. If it's empty it says so ("Be the first to light up the globe"), and nothing is faked.
- **Dots with meaning.** Each dot shows its vibe's emoji and color, pops in when someone joins, and is tagged **"In a call"** when busy (not tappable).
- **Connection flow.** An outgoing request card with a radar and a 30s countdown; incoming requests as bottom sheets on phones and cards on desktop; a soft synthesized ring (no audio file); clear Accept / Decline copy.
- **Chat like a modern messenger.** Grouped bubbles; hover actions for **React** (6 reactions), **Reply** (quoted) and **More** (Pin, Undo send); slim scrollbars; menus that unfold and close on an outside click or Escape.
- **Video.** Full-bleed remote video, a mirrored picture-in-picture of yourself captioned with exactly what the other person sees, and the chat kept beside the video (a sheet on phones).
- **Own visual identity.** Graphite with one sky-blue accent by default, because near-black, neon mint and frosted glass is what every app looks like right now. A **theme picker** offers Graphite, Navy and Cozy clay; the globe recolors with the theme. Colors are tokens, so a theme is about 20 lines.
- **Details:** `prefers-reduced-motion`, safe-area insets for notched phones, aria labels and roles, focus handling, and copy written for non-technical people (for example, step-by-step help for the user's own browser if location is blocked).

---

## Phase 3 - Make it secure

Ranked by impact. ✅ = fixed.

| Rank | Issue | Status |
|---|---|---|
| 1 | **Session impersonation (critical).** The session id was both the public id broadcast to everyone *and* the only credential. Anyone could read another user's mailbox (their SDP/ICE, which reveals IPs), kick anyone off the map, or send signals as them | ✅ Each tab holds a random 256-bit secret; its public id is `sha256(secret)`, computed server-side. The sender is always derived from the secret |
| 2 | **Unauthorized state changes (high).** Anyone could "accept" between any two ids, mark the whole map busy, end other people's chats, or push offers/ICE to strangers | ✅ A server-side pairing state machine (`Presence.peerId`): accept/decline only answer a request addressed to you, end only your own pairing, RTC signals only between two mutually paired sessions. Accept uses a conditional write, so it can't race |
| 3 | **Location triangulation (medium).** A re-join drew a fresh 1-3 km offset, so averaging several reveals the real spot | ✅ Re-joins reuse the first offset; the raw location is never kept |
| 4 | **Mailbox flooding / oversized payloads (medium)** | ✅ Max 60 pending signals per sender (429), SDP/ICE must be JSON under 32 KB, other types carry no payload |
| 5 | **Secret in URLs (medium).** Poll was GET with the id in the query string, so it landed in logs and history | ✅ POST with the secret in the body |
| 6 | **Untrusted peer on the data channel (medium).** Any string was accepted as a control message, with unbounded size | ✅ Whitelisted types, length caps, ids validated. Photos must really be JPEG, voice must really be audio (checked from magic bytes), size caps per file and 50 MB per chat, only the six reactions are accepted, and undo is honored only within 30s for the sender's own message |
| 7 | **Clickjacking into camera/mic prompts, missing headers (medium)** | ✅ CSP, `frame-ancestors 'none'` + XFO DENY, Permissions-Policy scoped to self, nosniff, no-referrer, HSTS, `no-store` on the API |
| 8 | **Privacy leaks in new features** | ✅ Photos are re-encoded, which strips EXIF/GPS; the country is looked up from the *offset* dot (the raw location never goes to Mapbox) and only a 2-letter code is accepted; gender is never sent to other users, and a non-matching request gets the same answer as "busy", so it can't be used to probe preferences |
| 9 | **Join flooding / fake dots.** Anyone can mint secrets and spam the globe | ⏳ Not fixed: needs per-IP rate limiting. A Vercel Firewall rate-limit rule on `/api/join` is the quickest win |
| 10 | **Your IP is visible to the person you connect with.** That's how WebRTC works with STUN only | ⏳ Inherent: a TURN relay with `iceTransportPolicy: "relay"` hides it, but needs a TURN service (out of scope: "no external services") |
| 11 | **Public Mapbox token** (public by design for GL JS) | ⏳ Restrict it to the deployment URL in the Mapbox dashboard |
| 12 | **`script-src 'unsafe-inline'`** (Next inline scripts + the theme boot script) | ⏳ Move to a nonce-based CSP via middleware |
| 13 | **Self-declared data** (gender, country, your own position on re-join) can be lied about | Accepted: there's no way to verify without accounts; it only ever limits *who you see*, and matching is mutual |
| 14 | **Undo send is best effort.** With P2P, a modified client can keep a copy | Accepted and stated; enforced for honest clients |
| 15 | **No block / report yet** | Top of the "next" list |

---

## Phase 4 - Make it better

**Theme: alive *and* safe.** A random stranger app is only fun if you feel in control, so most features are about **consent**.

**Safe**
- **Video starts blurred, at the source.** Your frames are blurred *on your device* before they're sent, so the other person can't see you until **you** tap "Show me", and a modified client can't skip it. Incoming video is also blurred locally until the other person shows themselves. Each person controls only their own camera.
- **Mutual matching.** "I am: Girl / Boy / Prefer not to say", "Talk to: Girls / Boys / Anyone". Both sides have to fit each other, enforced on the server, so you're never visible to or reachable by someone you didn't pick. Gender is never shown to anyone, and a "Looking for" switch on the map changes it any time.
- **Photos and voice notes, peer-to-peer.** Never uploaded. Photos are re-encoded (GPS stripped) and arrive blurred until you tap; voice notes are capped at 60s / 1 MB and never autoplay.
- **Undo send** within 30s, and a **leave confirmation** so a mis-tap or refresh doesn't drop a good conversation.

**Alive**
- **Vibes:** Just chatting, Music, Can't sleep, Travel stories, Study buddy, Need advice. Shown on dots, filterable with live counts (a "mood of the planet"), and they seed a tappable **icebreaker** when you connect.
- **Find someone:** picks a free match inside your filters (vibe + **country**) and previews it before calling: "Feeling just chatting, same as you · less than 10 km away · Angeles, Philippines". Say hello or Skip.
- **Live activity on the entry globe**, **"In a call"** tags, distance and place on every request, a ring for incoming requests, **reactions / reply / pins** (up to 5, shared, jump-to), and **themes**.

**Why these:** each one answers a real question a first-time user has. *Who's here? What are they up for? Is it safe to turn on my camera? Who can see me?*

**What I'd do next (I had a longer list, but it was getting a bit too much for one take-home 😄)**
- **Block & report:** never see that session again, plus an anonymous abuse counter.
- **Rate limiting** on join/signal (Vercel Firewall) and a **TURN relay** option to hide IPs.
- **On-device safety filter:** a small in-browser model that keeps video and photos blurred if it detects nudity, with nothing leaving the device.
- **Opt-in "translate this message"**, which suits "talk to someone, anywhere". AI icebreakers from both vibes, the time and the city (no chat content sent).
- **Tests** for the pairing state machine and matching rules; typing indicator; "someone just joined near you" pulses; WebSocket-free push via SSE to cut polling cost.

---

## Engineering practice

- **Small commits, one change each**, with messages that explain *why* (Phase 1 is one commit per bug). Each schema change has its own Prisma migration.
- **AGENTS.md:** this is Next.js 16, so I checked the bundled docs in `node_modules/next/dist/docs/` instead of assuming older APIs. For example, `allowedDevOrigins` is now strict (phone testing over LAN is blocked by default), and dev and build output are isolated.
- **Checked before every push:** `tsc`, `eslint`, a production `next build`, and a two-window browser run of the feature (two to three tabs for matching and activity).
- **Trust boundaries are explicit:** the server derives identity from the secret and enforces pairing; every data-channel message from the peer is validated as untrusted input.
- **No secrets in the repo:** `.env` is ignored, and Vercel holds the database URL and Mapbox token.
- **Missing:** automated tests. The pairing state machine and matching rules are the first things I'd cover.

## Assumptions & trade-offs

- **STUN only** (as stated in the brief): a minority of strict networks won't connect media.
- **Polling** stays (no WebSockets on serverless); stale rows are reaped on each poll, which is fine at this scale.
- **Gender, vibe and country** live only on the ephemeral presence row and are deleted with it. Gender is self-declared and never leaves the server.
- **Mapbox reverse geocoding** (place name, country) is part of the Mapbox account the app already requires, so it adds no new service. It's called with the *offset* position, once per connection.
- **Theme choice** is the only thing kept in the browser (localStorage); nothing else persists.
