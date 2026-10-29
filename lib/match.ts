// Who you are and who you'd like to talk to. Self-declared, never verified,
// and never sent to other people: the server only uses it to decide who can
// see and reach whom. Matching is mutual, so nobody is shown to (or can be
// requested by) someone they didn't choose.

export const GENDERS = [
  { id: "f", label: "Girl" },
  { id: "m", label: "Boy" },
  { id: "x", label: "Prefer not to say" },
] as const;
export const SEEKING = [
  { id: "f", label: "Girls" },
  { id: "m", label: "Boys" },
  { id: "any", label: "Anyone" },
] as const;

export type Gender = (typeof GENDERS)[number]["id"];
export type Seeking = (typeof SEEKING)[number]["id"];
export const DEFAULT_GENDER: Gender = "x";
export const DEFAULT_SEEKING: Seeking = "any";

export const isGender = (v: unknown): v is Gender =>
  GENDERS.some((g) => g.id === v);
export const isSeeking = (v: unknown): v is Seeking =>
  SEEKING.some((s) => s.id === v);

type Person = { gender: string; seeking: string };

const accepts = (seeking: string, gender: string) =>
  seeking === "any" || seeking === gender;

// Both people have to fit what the other is looking for. "Prefer not to
// say" only meets people looking for anyone.
export function compatible(a: Person, b: Person): boolean {
  return accepts(a.seeking, b.gender) && accepts(b.seeking, a.gender);
}

