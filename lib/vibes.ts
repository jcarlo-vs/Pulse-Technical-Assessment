// "Vibes": the mood a person picks when they drop onto the globe. Shown on
// their dot, filterable on the map, and used to seed a conversation starter
// so tapping a stranger feels less like a cold call. Still fully anonymous:
// a vibe is one of six fixed values, never free text.

export const VIBES = [
  {
    id: "chat",
    emoji: "☕",
    label: "Just chatting",
    color: "#7cf5c8",
    prompts: [
      "What's the best thing that happened to you today?",
      "What does it look like outside your window right now?",
      "What's something small you're looking forward to?",
    ],
  },
  {
    id: "music",
    emoji: "🎧",
    label: "Music",
    color: "#ff7ad9",
    prompts: [
      "What song have you had on repeat lately?",
      "What's a song from your country I should hear?",
      "Which artist would you fly across the world to see live?",
    ],
  },
  {
    id: "night",
    emoji: "🌙",
    label: "Can't sleep",
    color: "#a08cff",
    prompts: [
      "What time is it where you are? What's keeping you up?",
      "Night owl by nature, or just one of those nights?",
      "What do you usually do when you can't sleep?",
    ],
  },
  {
    id: "travel",
    emoji: "🗺️",
    label: "Travel stories",
    color: "#ffb86b",
    prompts: [
      "What's a place near you that tourists never find?",
      "Best trip you've ever taken, and why?",
      "If you could teleport anywhere right now, where?",
    ],
  },
  {
    id: "study",
    emoji: "📚",
    label: "Study buddy",
    color: "#6bc8ff",
    prompts: [
      "What are you working on right now?",
      "Want to do a 25-minute focus sprint together?",
      "What's the hardest thing you're learning at the moment?",
    ],
  },
  {
    id: "advice",
    emoji: "🌱",
    label: "Need advice",
    color: "#a6f07a",
    prompts: [
      "What's on your mind? Happy to just listen.",
      "Want a stranger's honest, no-judgment take on something?",
      "What would you tell a friend in your situation?",
    ],
  },
] as const;

export type Vibe = (typeof VIBES)[number];
export type VibeId = Vibe["id"];

export const DEFAULT_VIBE: VibeId = "chat";

export function isVibe(v: unknown): v is VibeId {
  return VIBES.some((x) => x.id === v);
}

export function vibeOf(id: string | undefined): Vibe {
  return VIBES.find((x) => x.id === id) ?? VIBES[0];
}

// A conversation starter for a pair: drawn from the stranger's vibe (that's
// what they came for), stable for a given stranger, shuffleable by `turn`.
export function icebreaker(theirVibe: string, theirId: string, turn = 0) {
  const prompts = vibeOf(theirVibe).prompts;
  let h = turn;
  for (let i = 0; i < theirId.length; i++) h = (h * 31 + theirId.charCodeAt(i)) | 0;
  return prompts[Math.abs(h) % prompts.length];
}
