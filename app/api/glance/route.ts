import { prisma } from "@/lib/prisma";
import { STALE_MS } from "@/lib/presence";
import type { Glance, GlanceStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SPOTS = 300;

// GET /api/glance - public, read-only "what's happening" for the entry
// screen, before anyone joins. Deliberately coarse: positions are rounded to
// a whole degree (~100 km) and carry only a status, never an id, vibe or
// gender, so it shows regional activity, not anyone's dot.
export async function GET() {
  const rows = await prisma.presence.findMany({
    where: { lastSeen: { gte: new Date(Date.now() - STALE_MS) } },
    select: { lat: true, lng: true, busy: true, peerId: true },
  });

  const counts: Glance["counts"] = { available: 0, inCall: 0, waiting: 0 };
  const spots = new Map<string, Glance["spots"][number]>();
  for (const r of rows) {
    const s: GlanceStatus = r.busy ? "call" : r.peerId ? "waiting" : "available";
    counts[s === "call" ? "inCall" : s]++;
    const lat = Math.round(r.lat);
    const lng = Math.round(r.lng);
    spots.set(`${lat},${lng},${s}`, { lat, lng, s });
  }

  const body: Glance = { counts, spots: [...spots.values()].slice(0, MAX_SPOTS) };
  return Response.json(body);
}
