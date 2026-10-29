import { createHash } from "node:crypto";

// Each browser holds a random 256-bit secret and never shares it with other
// users. Its public id (the one on the map and in signals) is sha256(secret),
// so seeing someone's id gives no way to act as them.
const SECRET_RE = /^[0-9a-f]{64}$/;

export function idFromSecret(secret: unknown): string | null {
  if (typeof secret !== "string" || !SECRET_RE.test(secret)) return null;
  return createHash("sha256").update(secret).digest("hex");
}

// Parse a JSON object body. Tolerates text/plain (sendBeacon can't set
// headers) and returns null for anything that isn't a JSON object.
export async function readJson(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const value = JSON.parse(await request.text());
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : null;
  } catch {
    return null;
  }
}

export const unauthorized = () =>
  Response.json({ error: "invalid session" }, { status: 401 });
export const badRequest = (error: string) =>
  Response.json({ error }, { status: 400 });
