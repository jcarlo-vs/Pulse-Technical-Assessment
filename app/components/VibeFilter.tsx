"use client";

import type { PeerDot } from "@/lib/types";
import { VIBES, type VibeId } from "@/lib/vibes";

// "Who's around, and in what mood?" Live counts per vibe double as a pulse
// of the planet's mood; tapping one filters the globe.
export default function VibeFilter({
  peers,
  value,
  onChange,
}: {
  peers: PeerDot[];
  value: VibeId | null;
  onChange: (v: VibeId | null) => void;
}) {
  const count = (id: VibeId) => peers.filter((p) => p.vibe === id).length;

  return (
    <nav
      aria-label="Filter by vibe"
      className="anim-fade absolute inset-x-0 top-[calc(max(1rem,env(safe-area-inset-top))+3.25rem)] z-20 flex justify-start overflow-x-auto px-4 [scrollbar-width:none] md:top-4 md:justify-center md:px-48"
    >
      <div className="flex gap-1.5">
        <Chip active={value === null} onClick={() => onChange(null)}>
          All <span className="tabular-nums text-ink-faint">{peers.length}</span>
        </Chip>
        {VIBES.map((v) => {
          const n = count(v.id);
          return (
            <Chip
              key={v.id}
              active={value === v.id}
              color={v.color}
              dim={n === 0}
              onClick={() => onChange(value === v.id ? null : v.id)}
              label={`${v.label}: ${n} online`}
            >
              <span aria-hidden="true">{v.emoji}</span>
              <span className="hidden lg:inline">{v.label}</span>
              <span className="tabular-nums text-ink-faint">{n}</span>
            </Chip>
          );
        })}
      </div>
    </nav>
  );
}

function Chip({
  active,
  color = "var(--accent)",
  dim,
  onClick,
  label,
  children,
}: {
  active: boolean;
  color?: string;
  dim?: boolean;
  onClick: () => void;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={`glass flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm transition ${
        dim && !active ? "opacity-50" : ""
      }`}
      style={
        active
          ? {
              borderColor: color,
              boxShadow: `0 0 0 1px ${color}, 0 0 18px -4px ${color}`,
            }
          : undefined
      }
    >
      {children}
    </button>
  );
}
