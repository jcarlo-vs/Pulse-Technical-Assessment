"use client";

import { useState } from "react";
import { GhostIcon, PinIcon, ShieldIcon } from "./icons";

// Landing overlay. Sits on top of the live, slowly spinning globe so the
// first thing people see is the product, not a form.
export default function EntryGate({
  onReady,
}: {
  onReady: (lat: number, lng: number) => Promise<void>;
}) {
  const [status, setStatus] = useState<"idle" | "locating" | "error">("idle");
  const [error, setError] = useState<string>("");

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
        onReady(pos.coords.latitude, pos.coords.longitude).catch(() =>
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

  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-end bg-[radial-gradient(ellipse_at_center,transparent_20%,rgba(5,6,13,0.55)_60%,rgba(5,6,13,0.95)_100%)] px-5 pb-[max(2rem,env(safe-area-inset-bottom))] md:justify-center md:pb-0">
      <div className="anim-rise pointer-events-auto w-full max-w-md text-center [text-shadow:0_1px_16px_rgba(5,6,13,0.95)]">
        <Wordmark />
        <p className="mx-auto mt-3 max-w-sm text-balance text-[15px] leading-relaxed text-ink-dim">
          Every glowing dot is a real person, right now. Tap one and say hello.
        </p>

        <button
          onClick={enter}
          disabled={status === "locating"}
          className="btn-primary mt-8 inline-flex h-14 w-full items-center justify-center gap-2 rounded-full text-base disabled:opacity-70 sm:w-auto sm:px-12"
        >
          {status === "locating" ? (
            <>
              <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Finding you…
            </>
          ) : (
            "Drop onto the globe"
          )}
        </button>

        {status === "error" && (
          <p
            role="alert"
            className="anim-fade mx-auto mt-4 max-w-sm rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-[#ffb3bd]"
          >
            {error}
          </p>
        )}

        <ul className="mx-auto mt-8 grid max-w-sm grid-cols-3 gap-2 text-[11px] leading-snug text-ink-dim">
          <Pledge icon={<PinIcon width={18} height={18} />}>
            Placed 1-3&nbsp;km from you
          </Pledge>
          <Pledge icon={<GhostIcon width={18} height={18} />}>
            No accounts, no names
          </Pledge>
          <Pledge icon={<ShieldIcon width={18} height={18} />}>
            Nothing stored. Ever.
          </Pledge>
        </ul>
      </div>
    </div>
  );
}

function Wordmark() {
  return (
    <h1 className="flex items-center justify-center gap-3">
      <svg
        viewBox="0 0 64 32"
        className="h-9 w-[4.5rem] text-accent drop-shadow-[0_0_12px_rgba(124,245,200,0.7)]"
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
      <span className="text-gradient text-5xl font-semibold tracking-tight">
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
    <li className="glass flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3">
      <span className="text-accent">{icon}</span>
      {children}
    </li>
  );
}
