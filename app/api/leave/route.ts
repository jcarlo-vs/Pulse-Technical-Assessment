import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, idFromSecret, readJson, unauthorized } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/leave - body { secret }. Called via navigator.sendBeacon on tab
// close. Removes the caller's presence + mailbox and, if they were paired,
// hangs up on their partner server-side (one beacon, no ordering races).
export async function POST(request: NextRequest) {
  const body = await readJson(request);
  if (!body) return badRequest("invalid body");
  const id = idFromSecret(body.secret);
  if (!id) return unauthorized();

  const me = await prisma.presence.findUnique({
    where: { id },
    select: { peerId: true },
  });

  // Independent cleanup writes - no atomicity needed (and interactive
  // transactions are unreliable over a PgBouncer pooler).
  await prisma.signal.deleteMany({
    where: { OR: [{ toId: id }, { fromId: id }] },
  });
  await prisma.presence.deleteMany({ where: { id } });

  if (me?.peerId) {
    const freed = await prisma.presence.updateMany({
      where: { id: me.peerId, peerId: id },
      data: { busy: false, peerId: null },
    });
    if (freed.count > 0) {
      await prisma.signal.create({
        data: { fromId: id, toId: me.peerId, type: "end" },
      });
    }
  }

  return Response.json({ ok: true });
}
