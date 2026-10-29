# Pulse - Notes

- **Live app:** https://juan-carlo-senin-pulse-letsgo.vercel.app
- **Repo:** https://github.com/jcarlo-vs/Pulse-Technical-Assessment

**How to try it:** open the live link in two windows (for example a normal window and an incognito one). In each window, pick a vibe and press **Drop in**. Then press **Find someone** in one window and **Accept** in the other. To place the two dots in different cities, use DevTools > Sensors > Location. It also works on a phone through the live link.

---

## Phase 1 - Make it run

For each problem I reproduced it with two windows, found the cause in the code, fixed it, and tested again. Each fix is its own commit.

| # | Problem | Cause | Fix |
|---|---|---|---|
| 1 | Dots stayed on the map after people left (the example in the brief) | The "I'm still here" update refreshed **everyone's** row instead of just the caller's, so nobody ever timed out | Only refresh the caller's row |
| 2 | Chat messages never arrived | The sender labelled messages `"msg"`, but the receiver only accepted `"chat"` | Use the same label on both sides |
| 3 | Two people often couldn't connect | Connection details that arrived early were applied too soon and silently thrown away | Apply them only after the connection is ready for them |
| 4 | After one chat, both people stayed "busy" forever | Ending a chat never cleared the busy flag | Clear it when a chat ends |
| 5 | If someone closed the tab, the other person's chat froze | Nothing told the partner that the chat had ended | Send "end" when the tab closes, and the server also ends the chat |
| 6 | People disappeared from the map for good | Background tabs check in less often, so they got removed and never came back | The server tells the app it was removed, and the app joins again automatically |
| 7 | A blank map with no explanation | A fake Mapbox token hid the "set your token" message | Removed the fake token |

---

## Phase 2 - Make it good

**Goal:** the first thing you see should be a living planet, not a form. It should feel calm, safe and a little magical.

- **Entry screen:** the globe on the left, and the steps on the right: (1) pick your vibe, (2) choose who you'd like to talk to, (3) drop in. The button changes with your vibe ("🎧 Drop in for music").
- **A globe that feels alive:**
  - A 3D globe with stars that slowly spins, then flies down to your location when you join.
  - Before you join, it already shows **real** activity: who's available, who's in a call, who's waiting for an answer.
  - If nobody is online it says so; nothing is faked.
- **Dots that mean something:** each dot shows the person's vibe (emoji and color), and says **"In a call"** when they're busy.
- **Connecting:** a "calling" card with a 30-second countdown, a soft ring when someone calls you, and clear Accept / Decline buttons.
- **Chat:** works like a modern messenger. You can react, reply, pin, and undo a message.
- **Video:** the chat stays visible beside the video, and your own small preview shows exactly what the other person sees.
- **Its own look:** a dark graphite theme with one blue accent, because neon-on-black is what most apps look like right now. You can switch to Navy or Cozy clay, and the globe changes color too.
- **Logo and sharing:** a Pulse logo (a heartbeat line ending in a dot) used as the browser-tab icon and the iPhone home-screen icon. A preview card appears when the link is shared, and the page has proper search engine info.
- **Every screen size:** phones get bottom sheets, and small laptops get a compact entry screen so nothing gets cut off or squashed.
- **Help in plain words:** if location is blocked, the app shows step-by-step instructions for the browser you're using.
- **Accessibility:** works with reduced motion, keyboard (Escape closes menus) and screen readers (labels on all buttons).

---

## Phase 3 - Make it secure

Ranked from most to least serious. ✅ = fixed.

| # | Problem | What I did |
|---|---|---|
| 1 | **Anyone could act as anyone else.** Everyone could see each user's ID, and that ID was also the only password. With it you could read someone's connection details (which include their IP address), remove them from the map, or send messages as them | ✅ Each browser tab now has its own private secret. The public ID is derived from it on the server, so seeing someone's ID isn't enough to act as them |
| 2 | **Anyone could mess with other people's chats.** For example, mark the whole map as busy, end strangers' chats, or send them connection data | ✅ The server now tracks who is paired with whom, and only allows actions that make sense: you can only accept a request sent to you, and only end your own chat |
| 3 | **Your real location could be worked out.** Each re-join picked a new random offset, so averaging several of them pointed to your real spot | ✅ A re-join keeps the same offset. The real location is never stored |
| 4 | **Spam and oversized messages** could fill up the server | ✅ Limits on how many pending messages each person can have, and on message size |
| 5 | **The ID was in the web address** of every request, so it ended up in logs and history | ✅ It's now sent inside the request instead |
| 6 | **The other person's browser was trusted completely.** It could send anything over the chat connection | ✅ Everything from the other person is checked: allowed message types only, size limits, photos must really be images, voice notes must really be audio, and a total limit per chat |
| 7 | **Missing browser security settings**, so the site could be embedded in other pages to trick people into allowing camera or mic | ✅ Added the standard protections: the site can't be embedded, camera, mic and location are limited to this site, plus HTTPS-only |
| 8 | **New features leaking private info** | ✅ Photos have their GPS data removed. Gender is never shown to anyone. Only the country code (from the offset dot) is stored. The public activity on the entry screen is rounded to about 100 km and has no names or IDs |
| 9 | **Someone could flood the map with fake dots** | ⏳ Not fixed yet. Needs rate limiting per IP address (a Vercel Firewall rule is the quickest way) |
| 10 | **The person you connect with can see your IP address.** That's how direct (peer-to-peer) connections work | ⏳ Would need a relay server (TURN) in between, which the brief rules out ("no external services") |
| 11 | **The Mapbox token is public** (Mapbox requires that for maps) | ⏳ Restrict it to this website in the Mapbox dashboard |
| 12 | **The security policy still allows inline scripts** (needed by Next.js and the theme loader) | ⏳ Could be tightened with per-request nonces |
| 13 | **People can lie about gender or country** | Accepted. There's no way to verify without accounts, and matching is two-way, so it only affects who you see |
| 14 | **Undo send can't be guaranteed.** A modified app on the other side could keep a copy | Accepted. Normal apps respect it, and the 30-second limit is enforced on both sides |
| 15 | **No block or report button yet** | First on the "next" list |

---

## Phase 4 - Make it better

**Idea:** talking to strangers is only fun if you feel safe and in control. So the new features are about **consent** (safe) and **knowing who's out there** (alive).

**Safe**
- **Video starts blurred.** Your camera is blurred on your own device before anything is sent, so nobody sees you until you tap **Show me**. The other person's video stays blurred until they choose to show themselves.
- **You choose who can find you.** "I am: Girl / Boy / Prefer not to say" and "Talk to: Girls / Boys / Anyone". Both people have to match each other, so you're never visible to someone you didn't pick. Your choice is never shown to anyone.
- **Photos and voice notes** go directly between the two people and are never uploaded. Photos have their location data removed and stay blurred until you tap them. Voice notes are limited to 60 seconds and never play by themselves.
- **Undo send** within 30 seconds, and a **"Leave this chat?"** check so a mis-tap doesn't end a good conversation.

**Alive**
- **Vibes:** Just chatting, Music, Can't sleep, Travel stories, Study buddy, Need advice. They show on the dots, you can filter by them, and they give you a conversation starter when you connect.
- **Find someone:** picks someone who matches your filters (vibe and country) and shows them first. For example: "Feeling just chatting, same as you · less than 10 km away · Angeles, Philippines". Then you choose Say hello or Skip.
- **More life:** live activity on the entry globe, "In a call" tags, a ring for incoming calls, reactions, replies, pinned messages, and themes.

**Why these:** each one answers a question a new user has. *Who's here? What are they in the mood for? Is it safe to turn on my camera? Who can see me?*

**What I'd add next.** I had a longer list, but it was getting a bit too much for one take-home 😄
- **Block and report** someone.
- **Rate limiting** against spam, and an option to **hide your IP address** with a relay server.
- **A safety filter** that runs on your own device and keeps video and photos blurred if it detects nudity.
- **Translate a message** with one tap, and AI conversation starters.
- **Automated tests**, a typing indicator, and a "someone just joined near you" effect.

---

## How I worked

- **Small commits**, one change each, with messages that explain why. Every database change has its own migration file.
- **Followed AGENTS.md:** this project uses a new version of Next.js (16), so I checked its included docs instead of relying on older habits. For example, Next 16 blocks testing from a phone on the local network by default.
- **Before every push:** type check, lint, a production build, and a real test with two or three browser windows.
- **No secrets in the repo.** Database and Mapbox keys live in Vercel.
- **Bugs I found in my own work** and fixed:
  - Cancelling "Leave site?" on refresh still ended the chat. Now it only ends when the page actually closes.
  - On small laptops the **Drop in** button got squashed and an extra scrollbar appeared.
  - Message menus got cut off at the edges, hid behind other messages, and didn't close when clicking outside.
  - On phones, the activity counter overlapped the first step.
- **Not done:** automated tests. They'd be the first thing I add.

## Blockers I hit

- **Testing on a real phone:** phones only allow location, camera and mic on secure (HTTPS) sites, so testing over the local network didn't work. I tested on phones using the live Vercel site instead.
- **iPhone browsers other than Safari** (like Chrome) need an extra iPhone setting for location, even after allowing the site. The app now explains this step.
- **The custom Vercel link was behind a login page** at first. I fixed it by adding it as the project's main domain.
- **Two-person features need two people**, so everything was tested with two or three windows and on a phone.

## Assumptions and trade-offs

- **Direct connections only (no relay server),** as the brief says. A few strict networks won't be able to connect video.
- **The app checks in with the server every few seconds** (no WebSockets on Vercel). That's fine at this scale.
- **Vibe, gender and country** are kept only while you're online and are deleted when you leave. Gender is never sent to other people.
- **Place names and countries** come from Mapbox, which the app already uses for the map, so no new service is added. They're looked up from your offset dot, never your exact location.
- **The theme you pick** is the only thing saved in your browser. Nothing else is kept.
