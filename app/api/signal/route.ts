import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, idFromSecret, readJson, unauthorized } from "@/lib/session";
import { compatible } from "@/lib/match";
import type { SignalType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TYPES: SignalType[] = [
  "request",
  "accept",
  "decline",
  "offer",
  "answer",
  "ice",
  "end",
];

const MAX_PAYLOAD = 32 * 1024; // SDP with audio+video is well under this.
const MAX_PENDING_PER_SENDER = 60; // undelivered signals; a flood guard.

const forbidden = (error: string) =>
  Response.json({ error }, { status: 403 });

// POST /api/signal - body { secret, toId, type, payload? }
// The sender is derived from the secret, never taken from the body. Every
// type is checked against the pairing state on Presence.peerId:
//
//   request  A -> B   A idle; B online + idle         sets A.peerId = B
//   accept   B -> A   A.peerId == B (A asked B)        both busy, paired
//   decline  B -> A   A.peerId == B                     clears A.peerId
//   end      A -> B   A.peerId == B                     unpairs both
//   offer/answer/ice  only between two busy, mutually paired sessions
export async function POST(request: NextRequest) {
  const body = await readJson(request);
  if (!body) return badRequest("invalid body");

  const fromId = idFromSecret(body.secret);
  if (!fromId) return unauthorized();

  const { toId, type, payload } = body;
  if (typeof toId !== "string" || toId.length > 64 || toId === fromId) {
    return badRequest("invalid recipient");
  }
  if (typeof type !== "string" || !VALID_TYPES.includes(type as SignalType)) {
    return badRequest("invalid type");
  }
  const signalType = type as SignalType;
  const isRtc = signalType === "offer" || signalType === "answer" || signalType === "ice";
  if (isRtc) {
    if (typeof payload !== "string" || payload.length > MAX_PAYLOAD || !isJson(payload)) {
      return badRequest("invalid payload");
    }
  } else if (payload !== undefined && payload !== null) {
    return badRequest("unexpected payload");
  }

  const [me, target] = await Promise.all([
    prisma.presence.findUnique({ where: { id: fromId } }),
    prisma.presence.findUnique({ where: { id: toId } }),
  ]);
  if (!me) return Response.json({ error: "not joined" }, { status: 410 });

  const pending = await prisma.signal.count({ where: { fromId } });
  if (pending >= MAX_PENDING_PER_SENDER) {
    return Response.json({ error: "slow down" }, { status: 429 });
  }

  switch (signalType) {
    case "request": {
      if (me.busy) return forbidden("already in a connection");
      // Offline or busy target: answer in the response instead of writing a
      // "decline" that appears to come from the target (unmetered by the
      // flood guard, and a forged sender).
      // Not a mutual match: answer exactly like "busy" so a request can't
      // be used to probe someone's preferences.
      if (!target || target.busy || !compatible(me, target)) {
        return Response.json({ ok: true, autoDeclined: true });
      }
      await prisma.presence.update({
        where: { id: fromId },
        data: { peerId: toId },
      });
      break;
    }

    case "accept": {
      if (me.busy) return forbidden("already in a connection");
      // Conditional write = the check: only succeeds if the requester is
      // still waiting on *us* and hasn't connected elsewhere meanwhile.
      const paired = await prisma.presence.updateMany({
        where: { id: toId, peerId: fromId, busy: false },
        data: { busy: true },
      });
      if (paired.count === 0) return forbidden("no pending request");
      await prisma.presence.update({
        where: { id: fromId },
        data: { busy: true, peerId: toId },
      });
      break;
    }

    case "decline": {
      const cleared = await prisma.presence.updateMany({
        where: { id: toId, peerId: fromId, busy: false },
        data: { peerId: null },
      });
      if (cleared.count === 0) return forbidden("no pending request");
      break;
    }

    case "end": {
      if (me.peerId !== toId) return forbidden("not connected");
      await prisma.presence.update({
        where: { id: fromId },
        data: { busy: false, peerId: null },
      });
      await prisma.presence.updateMany({
        where: { id: toId, peerId: fromId },
        data: { busy: false, peerId: null },
      });
      break;
    }

    default: {
      // offer / answer / ice
      if (!me.busy || me.peerId !== toId || target?.peerId !== fromId) {
        return forbidden("not connected");
      }
    }
  }

  await deliver(fromId, toId, signalType, isRtc ? (payload as string) : null);
  return Response.json({ ok: true });
}

function deliver(
  fromId: string,
  toId: string,
  type: SignalType,
  payload: string | null = null,
) {
  return prisma.signal.create({ data: { fromId, toId, type, payload } });
}

function isJson(s: string): boolean {
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
}
