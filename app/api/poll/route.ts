import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { STALE_MS, SIGNAL_TTL_MS } from "@/lib/presence";
import { badRequest, idFromSecret, readJson, unauthorized } from "@/lib/session";
import type { PollResponse, SignalMsg } from "@/lib/types";
import { compatible, isSeeking } from "@/lib/match";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/poll - body { secret, seeking? }. POST (not GET ?id=) so the session secret
// never lands in URLs, access logs or browser history.
// It (1) heartbeats the caller, (2) reaps stale presence + orphan signals,
// (3) returns the online peers, and (4) drains this user's mailbox.
export async function POST(request: NextRequest) {
  const body = await readJson(request);
  if (!body) return badRequest("invalid body");
  const id = idFromSecret(body.secret);
  if (!id) return unauthorized();

  const now = Date.now();
  const staleCutoff = new Date(now - STALE_MS);
  const signalCutoff = new Date(now - SIGNAL_TTL_MS);

  // 1) Heartbeat - refresh lastSeen for the caller, plus who they're looking
  // for (changeable any time from the map).
  const touched = await prisma.presence.updateMany({
    where: { id },
    data: {
      lastSeen: new Date(now),
      ...(isSeeking(body.seeking) ? { seeking: body.seeking } : {}),
    },
  });
  // Row was reaped (e.g. a backgrounded tab's timers were throttled past
  // STALE_MS). Tell the client to re-join instead of polling as a ghost.
  if (touched.count === 0) {
    return Response.json({ error: "not joined" }, { status: 410 });
  }

  // 2) Reap stale presence rows and orphaned signals (independent deletes -
  // no atomicity needed, and avoids transactions over a PgBouncer pooler).
  await prisma.presence.deleteMany({ where: { lastSeen: { lt: staleCutoff } } });
  await prisma.signal.deleteMany({ where: { createdAt: { lt: signalCutoff } } });

  // 3) Online peers (self included, so we can check our own pairing below).
  const rows = await prisma.presence.findMany({
    where: { lastSeen: { gte: staleCutoff } },
    select: {
      id: true,
      lat: true,
      lng: true,
      busy: true,
      peerId: true,
      vibe: true,
      gender: true,
      seeking: true,
    },
  });
  const me = rows.find((r) => r.id === id);

  // 4) Drain this user's mailbox: read, then delete exactly what we read so a
  // concurrently-inserted signal is never lost.
  const inbox = await prisma.signal.findMany({
    where: { toId: id },
    orderBy: { createdAt: "asc" },
  });
  if (inbox.length > 0) {
    await prisma.signal.deleteMany({
      where: { id: { in: inbox.map((s) => s.id) } },
    });
  }

  const signals: SignalMsg[] = inbox.map((s) => ({
    id: s.id,
    fromId: s.fromId,
    toId: s.toId,
    type: s.type as SignalMsg["type"],
    payload: s.payload,
    createdAt: s.createdAt.toISOString(),
  }));

  // Partner vanished without a clean leave (crashed tab, lost network):
  // free the caller and hang up on their behalf.
  if (me?.peerId && !rows.some((r) => r.id === me.peerId)) {
    await prisma.presence.updateMany({
      where: { id, peerId: me.peerId },
      data: { busy: false, peerId: null },
    });
    signals.push({
      id: `reaped-${me.peerId}`,
      fromId: me.peerId,
      toId: id,
      type: me.busy ? "end" : "decline",
      payload: null,
      createdAt: new Date(now).toISOString(),
    });
  }

  const response: PollResponse = {
    // Only people who match both ways (plus whoever we're already talking
    // to). Gender itself never leaves the server.
    peers: rows
      .filter(
        (p) =>
          p.id !== id &&
          (!me || compatible(me, p) || p.id === me.peerId || p.peerId === id),
      )
      .map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, busy: p.busy, vibe: p.vibe })),
    signals,
  };

  return Response.json(response);
}
