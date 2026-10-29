import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyPrivacyOffset, isValidLatLng } from "@/lib/geo";
import { DEFAULT_VIBE, isVibe } from "@/lib/vibes";
import { DEFAULT_GENDER, DEFAULT_SEEKING, isGender, isSeeking } from "@/lib/match";
import { badRequest, idFromSecret, readJson, unauthorized } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/join - body { secret, lat, lng, vibe?, gender?, seeking?, rejoin? }.
// First join: lat/lng are raw coords; a 1-3 km privacy offset is applied and
// only the offset position is stored. Rejoin (after being reaped): the client
// sends back the offset position it was given, which is stored as-is. Drawing
// a fresh offset on every rejoin would let an observer average many offsets
// back to the real location.
export async function POST(request: NextRequest) {
  const body = await readJson(request);
  if (!body) return badRequest("invalid body");

  const id = idFromSecret(body.secret);
  if (!id) return unauthorized();

  const { lat, lng } = body;
  if (!isValidLatLng(lat, lng)) return badRequest("invalid coordinates");

  // Only one of the fixed vibes is ever stored: no free text on the map.
  const vibe = isVibe(body.vibe) ? body.vibe : DEFAULT_VIBE;
  const gender = isGender(body.gender) ? body.gender : DEFAULT_GENDER;
  const seeking = isSeeking(body.seeking) ? body.seeking : DEFAULT_SEEKING;

  const pos =
    body.rejoin === true
      ? { lat: lat as number, lng: lng as number }
      : applyPrivacyOffset(lat as number, lng as number);

  await prisma.presence.upsert({
    where: { id },
    create: { id, ...pos, vibe, gender, seeking, busy: false, lastSeen: new Date() },
    update: { ...pos, vibe, gender, seeking, lastSeen: new Date() },
  });

  // Return the offset position so the client shows the user where others
  // actually see them (never their exact location).
  return Response.json({ ok: true, ...pos });
}
