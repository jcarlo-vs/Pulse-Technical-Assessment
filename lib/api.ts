// Client-side helpers for talking to the coordination API. Every call
// authenticates with this tab's session secret, sent only in POST bodies.
import type { PollResponse, SignalType } from "@/lib/types";
import type { Gender, Seeking } from "@/lib/match";

export interface Profile {
  vibe: string;
  gender: Gender;
  seeking: Seeking;
}

// 256-bit random session secret, hex encoded. Lives only in this tab's memory.
export function newSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function post(url: string, data: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    cache: "no-store",
  });
}

// Returns the privacy-offset position the server placed this user at.
// `rejoin` re-sends a previously assigned offset position as-is.
export async function join(
  secret: string,
  lat: number,
  lng: number,
  profile: Profile,
  rejoin = false,
): Promise<{ lat: number; lng: number }> {
  const res = await post("/api/join", { secret, lat, lng, ...profile, rejoin });
  if (!res.ok) throw new Error(`join failed: ${res.status}`);
  const data = await res.json();
  return { lat: data.lat, lng: data.lng };
}

// Returns null when the server no longer knows this session (caller must re-join).
// `seeking` rides along so the "looking for" switch applies on the next poll.
export async function poll(
  secret: string,
  seeking: Seeking,
  country?: string,
): Promise<PollResponse | null> {
  const res = await post("/api/poll", { secret, seeking, country });
  if (res.status === 410) return null;
  if (!res.ok) throw new Error(`poll failed: ${res.status}`);
  return res.json();
}

// `autoDeclined`: the target was offline/busy, so the request was refused
// on the spot rather than delivered.
export async function sendSignal(
  secret: string,
  toId: string,
  type: SignalType,
  payload?: string,
): Promise<{ autoDeclined?: boolean }> {
  const res = await post("/api/signal", { secret, toId, type, payload });
  return res.ok ? res.json() : {};
}

// Fire-and-forget leave that survives the tab closing. The server also hangs
// up on our partner, so one beacon is enough.
export function leave(secret: string): void {
  const body = JSON.stringify({ secret });
  if (!navigator.sendBeacon?.("/api/leave", body)) {
    void fetch("/api/leave", { method: "POST", body, keepalive: true });
  }
}
