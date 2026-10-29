"use client";

import { useEffect, useState } from "react";
import { GhostIcon, PinIcon, ShieldIcon } from "./icons";
import { DEFAULT_VIBE, VIBES, type VibeId } from "@/lib/vibes";
import {
  DEFAULT_GENDER,
  DEFAULT_SEEKING,
  GENDERS,
  SEEKING,
  type Gender,
  type Seeking,
} from "@/lib/match";
import type { Profile } from "@/lib/api";
import type { Glance } from "@/lib/types";
import ThemePicker from "./ThemePicker";

// Landing overlay. Sits on top of the live, slowly spinning globe so the
// first thing people see is the product, not a form.
export default function EntryGate({
  onReady,
  counts,
}: {
  onReady: (lat: number, lng: number, profile: Profile) => Promise<void>;
  counts?: Glance["counts"];
}) {
  const [vibe, setVibe] = useState<VibeId>(DEFAULT_VIBE);
  const [gender, setGender] = useState<Gender>(DEFAULT_GENDER);
  const [seeking, setSeeking] = useState<Seeking>(DEFAULT_SEEKING);
  const [status, setStatus] = useState<"idle" | "locating" | "error">("idle");
  const [error, setError] = useState<string>("");
  // geolocation waits indefinitely on an unanswered permission prompt (the
  // timeout only starts after it's granted), and some browsers show that
  // prompt as a tiny address-bar icon. Explain instead of spinning silently.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (status !== "locating") return;
    const t = setTimeout(() => setSlow(true), 6000);
    return () => {
      clearTimeout(t);
      setSlow(false);
    };
  }, [status]);

  function fail(message: string) {
    setStatus("error");
    setError(message);
  }

  function enter() {
    if (!("geolocation" in navigator)) {
      fail("Your browser doesn't support location access.");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        onReady(pos.coords.latitude, pos.coords.longitude, {
          vibe,
          gender,
          seeking,
        }).catch(() =>
          fail("Couldn't reach Pulse. Check your connection and try again."),
        ),
      (err) =>
        fail(
          err.code === err.PERMISSION_DENIED
            ? "Location permission is needed to place your dot. Enable it in your browser's site settings, then try again."
            : "Couldn't get your location. Please try again.",
        ),
      // High accuracy + maximumAge:0 forces a fresh fix (Wi-Fi/GPS scan)
      // instead of reusing the browser's cached IP-based location.
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  const current = VIBES.find((v) => v.id === vibe) ?? VIBES[0];

  return (
    // Globe + how it works: the live globe fills the left (or top, on a
    // phone) and the steps sit beside it. Picking a vibe *is* step 1.
    // Desktop: globe and panel stay together as one centered pair (max
    // 1320px), so wide screens don't strand the panel at the far edge. The
    // map pads its right side by the same panel width (WorldMap).
    <div className="pointer-events-none absolute inset-0 z-40 flex items-end bg-[linear-gradient(to_top,color-mix(in_srgb,var(--bg)_97%,transparent)_45%,transparent_75%)] md:items-center md:justify-center md:bg-none">
      {counts && <Activity counts={counts} />}
      <div className="w-full md:flex md:max-w-[1320px] md:justify-end">
      <div className="anim-rise pointer-events-auto max-h-[100dvh] w-full overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 md:flex md:max-h-[calc(100dvh-2rem)] md:w-[min(600px,48vw)] md:flex-col md:justify-center md:rounded-[32px] md:border md:border-line md:bg-[var(--panel)] md:shadow-[0_40px_90px_-30px_rgba(0,0,0,0.7)] md:px-12 md:py-10 md:backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <Wordmark />
          <ThemePicker />
        </div>
        <h2 className="mt-3 text-balance text-[24px] font-semibold sm:mt-4 sm:text-[28px] leading-[1.1] tracking-tight md:mt-6 md:text-[44px]">
          Talk to someone, somewhere, right now.
        </h2>

        <ol className="mt-4 space-y-3.5 sm:mt-6 sm:space-y-5 md:mt-8">
          <Step n={1} active title="Pick your vibe" text="So people know what you're up for before they tap.">
            <fieldset className="mt-3">
              <legend className="sr-only">Your vibe</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {VIBES.map((v) => {
                  const active = v.id === vibe;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setVibe(v.id)}
                      aria-pressed={active}
                      className="glass flex h-10 items-center gap-2 rounded-2xl px-3 text-left text-[13px] sm:h-11 transition hover:bg-white/10"
                      style={
                        active
                          ? {
                              borderColor: v.color,
                              background: `color-mix(in srgb, ${v.color} 14%, transparent)`,
                              boxShadow: `0 0 0 1px ${v.color}, 0 0 22px -8px ${v.color}`,
                              color: "white",
                            }
                          : { color: "var(--ink-dim)" }
                      }
                    >
                      <span className="text-base" aria-hidden="true">
                        {v.emoji}
                      </span>
                      <span className="truncate">{v.label}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </Step>
          <Step n={2} phone title="Who you'd like to talk to" text="Only people who'd also pick you can see your dot. Never shown to anyone, not verified.">
            <div className="mt-3 space-y-2">
              <Segmented label="I am" options={GENDERS} value={gender} onChange={setGender} />
              <Segmented label="Talk to" options={SEEKING} value={seeking} onChange={setSeeking} />
            </div>
          </Step>
          <Step n={3} title="Drop in and say hello" text="Your dot lands near you, never on your exact spot. Chat first; video starts blurred." />
        </ol>

        <button
          onClick={enter}
          disabled={status === "locating"}
          className="mt-5 inline-flex h-13 w-full sm:mt-7 sm:h-14 items-center justify-center gap-2 rounded-full px-8 text-base font-semibold text-[var(--accent-ink)] transition hover:brightness-110 disabled:opacity-70 md:w-auto md:self-start"
          style={{
            background: "linear-gradient(135deg, var(--accent), var(--accent-end))",
            boxShadow: "0 10px 32px -12px var(--accent)",
          }}
        >
          {status === "locating" ? (
            <>
              <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Finding you…
            </>
          ) : (
            <>
              <span aria-hidden="true">{current.emoji}</span>
              Drop in {CTA[current.id]}
            </>
          )}
        </button>

        {status === "locating" && slow && (
          <p
            role="status"
            className="anim-fade mt-4 max-w-sm rounded-xl border border-line bg-white/[0.04] px-4 py-2.5 text-sm text-ink-dim"
          >
            Still waiting for location access. Look for a 📍 prompt near your
            browser&rsquo;s address bar and choose <b>Allow</b>.
          </p>
        )}

        {status === "error" && (
          <p
            role="alert"
            className="anim-fade mt-4 max-w-sm rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-[#ffb3bd]"
          >
            {error}
          </p>
        )}

        <ul className="mt-4 flex flex-wrap sm:mt-6 gap-x-5 gap-y-2 text-xs text-ink-dim">
          <Pledge icon={<PinIcon width={15} height={15} />}>Exact spot never shown</Pledge>
          <Pledge icon={<GhostIcon width={15} height={15} />}>No accounts, no names</Pledge>
          <Pledge icon={<ShieldIcon width={15} height={15} />}>Nothing stored</Pledge>
        </ul>
      </div>
      </div>
    </div>
  );
}

const CTA: Record<VibeId, string> = {
  chat: "to just chat",
  music: "for music",
  night: "because you can't sleep",
  travel: "for travel stories",
  study: "to study together",
  advice: "for advice",
};

// Live, real counts under the globe: the page promises every dot is a real
// person, so nothing here is simulated. Empty is said out loud.
function Activity({ counts }: { counts: Glance["counts"] }) {
  const total = counts.available + counts.inCall + counts.waiting;
  return (
    <div
      aria-live="polite"
      className="glass anim-fade pointer-events-auto absolute left-1/2 top-[max(1rem,env(safe-area-inset-top))] flex -translate-x-1/2 flex-wrap items-center justify-center gap-x-4 gap-y-1 whitespace-nowrap rounded-full px-4 py-2 text-xs text-ink-dim md:bottom-8 md:left-[calc((100vw-min(600px,48vw))/2)] md:top-auto md:text-sm"
    >
      {total === 0 ? (
        <span>Nobody here yet. Be the first to light up the globe.</span>
      ) : (
        <>
          <Count color="#7cf5c8" n={counts.available} label="available" pulse />
          <Count color="#a08cff" n={counts.inCall} label="in a call" />
          <Count color="#ffb86b" n={counts.waiting} label="waiting" />
        </>
      )}
    </div>
  );
}

function Count({ color, n, label, pulse }: { color: string; n: number; label: string; pulse?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={`size-2 rounded-full ${pulse ? "animate-pulse" : ""}`}
        style={{ background: color, boxShadow: `0 0 8px ${color}` }}
      />
      <b className="font-semibold tabular-nums text-ink">{n}</b> {label}
    </span>
  );
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-xs text-ink-faint">{label}</span>
      <div className="glass flex flex-1 gap-1 rounded-full p-1">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            onClick={() => onChange(o.id)}
            className={`h-9 flex-1 truncate rounded-full px-2 text-[13px] transition ${
              value === o.id ? "bg-white font-medium text-black" : "text-ink-dim hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Step({
  n,
  active,
  phone,
  title,
  text,
  children,
}: {
  n: number;
  active?: boolean;
  phone?: boolean; // keep the description on small screens
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex gap-4">
      <span
        className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold ${
          active ? "bg-accent text-[var(--accent-ink)]" : "bg-accent/10 text-accent"
        }`}
        aria-hidden="true"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-tight">{title}</p>
        <p className={`mt-0.5 text-sm leading-snug text-ink-dim ${phone ? "" : "hidden sm:block"}`}>
          {text}
        </p>
        {children}
      </div>
    </li>
  );
}

function Wordmark() {
  return (
    <h1 className="flex items-center gap-2.5">
      <svg
        viewBox="0 0 64 32"
        className="h-7 w-14 text-accent drop-shadow-[0_0_12px_var(--accent)]"
        aria-hidden="true"
      >
        <path
          d="M2 16h14l4-10 8 20 6-14 4 4h24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="260"
          style={{ animation: "heartbeat 2.4s ease-out infinite" }}
        />
      </svg>
      <span className="text-gradient text-3xl font-semibold tracking-tight">
        Pulse
      </span>
    </h1>
  );
}

function Pledge({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-1.5">
      <span className="text-accent">{icon}</span>
      {children}
    </li>
  );
}
