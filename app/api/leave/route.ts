import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/leave — body { id }. Removes the presence row and any pending
// signals to/from this user. Called via navigator.sendBeacon on tab close, so
// the body may arrive as text — parse defensively.
export async function POST(request: NextRequest) {
  let id: string | undefined;
  try {
    const text = await request.text();
    id = text ? (JSON.parse(text)?.id as string | undefined) : undefined;
  } catch {
    id = undefined;
  }

  if (typeof id !== "string" || !id) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }

  // Independent cleanup deletes — no atomicity needed (and interactive
  // transactions are unreliable over a PgBouncer pooler).
  // Keep outgoing "end" signals: they tell the partner we hung up, and the
  // leave beacon can land before the partner has polled them.
  await prisma.signal.deleteMany({
    where: { OR: [{ toId: id }, { fromId: id, type: { not: "end" } }] },
  });
  await prisma.presence.deleteMany({ where: { id } });

  return Response.json({ ok: true });
}
