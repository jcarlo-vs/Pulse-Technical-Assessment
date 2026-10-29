"use client";

import { useState } from "react";
import type { PeerDot } from "@/lib/types";
import { VIBES, type VibeId } from "@/lib/vibes";
import { countryLabel } from "@/lib/geo";

// Major countries only, so the picker stays short. People anywhere else are
// still on the globe under "Anywhere".
const COUNTRIES = [
  "US", "GB", "CA", "AU", "PH", "JP", "KR", "CN", "VN", "TH",
  "SG", "MY", "ID", "IN", "DE", "FR", "ES", "IT", "BR", "MX",
];

// "Who's around, and in what mood?" Live counts per vibe double as a pulse
// of the planet's mood; tapping one filters the globe.
export default function VibeFilter({
  peers,
  value,
  onChange,
  country,
  onCountry,
  online,
}: {
  peers: PeerDot[];
  value: VibeId | null;
  onChange: (v: VibeId | null) => void;
  country: string | null;
  onCountry: (c: string | null) => void;
  online: number;
}) {
  const inCountry = country ? peers.filter((p) => p.country === country) : peers;
  const count = (id: VibeId) => inCountry.filter((p) => p.vibe === id).length;

  return (
    <nav
      aria-label="Filters"
      className="anim-fade absolute inset-x-0 top-[calc(max(1rem,env(safe-area-inset-top))+2rem)] z-20 flex items-center gap-1.5 px-4 md:top-4 md:justify-center md:px-48"
    >
      {/* Phones: brand + online count live here, since some mobile browsers
          (Chrome on iPhone) draw their toolbar over the very top. */}
      <div
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line bg-[var(--glass-strong)] px-2.5 text-xs font-semibold shadow-lg md:hidden"
        aria-label={`Pulse, ${online} other ${online === 1 ? "person" : "people"} online`}
      >
        <span className="size-2 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" />
        Pulse
        <span className="rounded-full bg-white/[0.08] px-1.5 tabular-nums leading-5">{online}</span>
      </div>
      <CountryPicker peers={peers} value={country} onChange={onCountry} />
      {/* Phones: one dropdown with names instead of a row of icons. */}
      <VibePicker value={value} onChange={onChange} count={count} total={inCountry.length} />
      <div className="hidden min-w-0 gap-1.5 overflow-x-auto [scrollbar-width:none] md:flex">
        <Chip active={value === null} onClick={() => onChange(null)} count={inCountry.length}>
          All
        </Chip>
        {VIBES.map((v) => {
          const n = count(v.id);
          return (
            <Chip
              key={v.id}
              active={value === v.id}
              color={v.color}
              count={n}
              onClick={() => onChange(value === v.id ? null : v.id)}
              label={`${v.label}: ${n} online`}
            >
              <span aria-hidden="true">{v.emoji}</span>
              <span className="hidden xl:inline">{v.label}</span>
            </Chip>
          );
        })}
      </div>
    </nav>
  );
}

function VibePicker({
  value,
  onChange,
  count,
  total,
}: {
  value: VibeId | null;
  onChange: (v: VibeId | null) => void;
  count: (id: VibeId) => number;
  total: number;
}) {
  const [state, setState] = useState<"closed" | "open" | "closing">("closed");
  const open = state === "open";
  const close = () => {
    setState("closing");
    setTimeout(() => setState("closed"), 150);
  };
  const pick = (v: VibeId | null) => {
    onChange(v);
    close();
  };
  const current = VIBES.find((v) => v.id === value);
  const options = [
    { id: null, emoji: "✨", label: "All vibes", n: total, color: "var(--accent)" },
    ...VIBES.map((v) => ({ id: v.id, emoji: v.emoji, label: v.label, n: count(v.id), color: v.color })),
  ];

  return (
    <div className="relative min-w-0 md:hidden">
      <button
        type="button"
        onClick={() => (open ? close() : setState("open"))}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Vibe: ${current?.label ?? "All vibes"}`}
        className="flex h-8 max-w-full items-center gap-1.5 rounded-full border bg-[var(--glass-strong)] px-2.5 text-[13px] shadow-lg md:h-9 md:px-3 md:text-sm"
        style={{ borderColor: current ? current.color : "var(--line)" }}
      >
        <span aria-hidden="true">{current?.emoji ?? "✨"}</span>
        <span className="truncate">{current?.label ?? "All vibes"}</span>
        <span className="rounded-full bg-white/[0.08] px-1.5 text-[11px] font-semibold tabular-nums leading-5">
          {current ? count(current.id) : total}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`shrink-0 text-ink-faint transition ${open ? "rotate-180" : ""}`} aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {state !== "closed" && (
        <>
          <button type="button" aria-label="Close" className="fixed inset-0 z-10 cursor-default" onClick={close} />
          <ul
            role="listbox"
            aria-label="Vibe"
            className={`glass-strong scroll-slim absolute left-0 top-full z-20 mt-2 w-56 rounded-2xl p-1.5 text-sm ${open ? "menu-in" : "menu-out"}`}
          >
            {options.map((o) => {
              const active = value === o.id;
              return (
                <li key={o.id ?? "all"}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => pick(o.id)}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/10 ${active ? "bg-white/10" : ""} ${o.n === 0 && !active ? "text-ink-faint" : ""}`}
                  >
                    <span aria-hidden="true">{o.emoji}</span>
                    <span className="truncate">{o.label}</span>
                    <span
                      className="ml-auto rounded-full px-2 text-xs tabular-nums"
                      style={{ background: active ? o.color : "rgba(255,255,255,0.07)", color: active ? "#0b0b0c" : undefined }}
                    >
                      {o.n}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function CountryPicker({
  peers,
  value,
  onChange,
}: {
  peers: PeerDot[];
  value: string | null;
  onChange: (c: string | null) => void;
}) {
  // "closing" keeps the list mounted for its fold-up animation.
  const [state, setState] = useState<"closed" | "open" | "closing">("closed");
  const open = state === "open";
  const close = () => {
    setState("closing");
    setTimeout(() => setState("closed"), 150);
  };
  const n = (c: string) => peers.filter((p) => p.country === c).length;
  const pick = (c: string | null) => {
    onChange(c);
    close();
  };
  const [flag, ...name] = value ? countryLabel(value).split(" ") : ["🌍", "Anywhere"];

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => (open ? close() : setState("open"))}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Country: ${value ? name.join(" ") : "Anywhere"}`}
        className="flex h-8 items-center gap-1.5 rounded-full border border-line bg-[var(--glass-strong)] px-2.5 text-[13px] shadow-lg md:h-9 md:px-3 md:text-sm"
        style={value ? { borderColor: "var(--accent)" } : undefined}
      >
        <span aria-hidden="true">{flag}</span>
        <span className="hidden max-w-28 truncate sm:inline">{name.join(" ")}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`text-ink-faint transition ${open ? "rotate-180" : ""}`} aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {state !== "closed" && (
        <>
          <button type="button" aria-label="Close" className="fixed inset-0 z-10 cursor-default" onClick={close} />
          <ul
            role="listbox"
            aria-label="Country"
            className={`glass-strong scroll-slim absolute left-0 top-full z-20 mt-2 max-h-[60vh] w-60 overflow-y-auto rounded-2xl p-1.5 text-sm ${open ? "menu-in" : "menu-out"}`}
          >
            {[null, ...COUNTRIES].map((c) => {
              const count = c ? n(c) : peers.length;
              const active = value === c;
              return (
                <li key={c ?? "any"}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => pick(c)}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition hover:bg-white/10 ${active ? "bg-white/10" : ""} ${count === 0 && !active ? "text-ink-faint" : ""}`}
                  >
                    <span className="truncate">{c ? countryLabel(c) : "🌍 Anywhere"}</span>
                    <span className="ml-auto rounded-full bg-white/[0.07] px-2 text-xs tabular-nums">{count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function Chip({
  active,
  color = "var(--accent)",
  count,
  onClick,
  label,
  children,
}: {
  active: boolean;
  color?: string;
  count: number;
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
      className={`flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm shadow-lg transition hover:brightness-125 ${
        active ? "text-ink" : count === 0 ? "text-ink-faint" : "text-ink-dim"
      }`}
      style={{
        background: active
          ? `color-mix(in srgb, ${color} 24%, var(--glass-strong))`
          : "var(--glass-strong)",
        borderColor: active ? color : "var(--line)",
      }}
    >
      {children}
      <span
        className="min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold tabular-nums leading-5"
        style={{
          background: active ? color : "rgba(255,255,255,0.08)",
          color: active ? "#0b0b0c" : undefined,
        }}
      >
        {count}
      </span>
    </button>
  );
}
