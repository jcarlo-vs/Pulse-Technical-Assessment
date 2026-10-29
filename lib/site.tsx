// Public site details, shared by metadata, robots, sitemap and share images.
export const SITE_URL = "https://juan-carlo-senin-pulse-letsgo.vercel.app";
export const SITE_NAME = "Pulse";
export const SITE_TAGLINE = "Talk to someone, somewhere, right now.";
export const SITE_DESCRIPTION =
  "A living globe of anonymous strangers. Pick a vibe, drop onto the map, and start a private, peer-to-peer chat or video call. No accounts, nothing stored.";

// The heartbeat mark (app/icon.svg) as JSX, for generated PNGs.
export function LogoMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <rect width="64" height="64" rx="16" fill="#141417" />
      <path
        d="M9 35h11l5-13 8 23 6-15 4 5h8"
        fill="none"
        stroke="#3aa8f5"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="53" cy="35" r="7" fill="#7cc4ff" fillOpacity="0.22" />
      <circle cx="53" cy="35" r="3.5" fill="#bfe3ff" />
    </svg>
  );
}
