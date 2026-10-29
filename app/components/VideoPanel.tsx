"use client";

import { useEffect, useRef, useState } from "react";
import {
  MicIcon,
  MicOffIcon,
  PhoneOffIcon,
  ShieldIcon,
  VideoIcon,
  VideoOffIcon,
} from "./icons";

export default function VideoPanel({
  localStream,
  remoteStream,
  reveal,
  onToggleReveal,
  onEnd,
}: {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  reveal: { mine: boolean; theirs: boolean };
  onToggleReveal: () => void;
  onEnd: () => void;
}) {
  const clear = reveal.mine && reveal.theirs;
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  useEffect(() => {
    if (localRef.current && localRef.current.srcObject !== localStream) {
      localRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    const el = remoteRef.current;
    if (el && el.srcObject !== remoteStream) {
      el.srcObject = remoteStream;
      // autoPlay alone can lose a race with the autoplay policy when the
      // stream attaches after mount; the user has already interacted
      // (tapped a dot, accepted), so an explicit play() is allowed.
      void el.play().catch(() => {});
    }
  }, [remoteStream]);

  // Muting just disables the local track: no renegotiation, instant toggle.
  function toggle(kind: "audio" | "video") {
    const tracks =
      kind === "audio"
        ? localStream?.getAudioTracks()
        : localStream?.getVideoTracks();
    const next = kind === "audio" ? !micOn : !camOn;
    tracks?.forEach((t) => (t.enabled = next));
    if (kind === "audio") setMicOn(next);
    else setCamOn(next);
  }

  return (
    <div className="anim-fade absolute inset-0 z-40 bg-black">
      {/* Remote (full screen) */}
      {/* Their camera is already blurred at their end until you've both
          revealed; we blur it here too, so a modified client can't flash
          you either. */}
      <video
        ref={remoteRef}
        autoPlay
        playsInline
        className={`h-full w-full object-cover transition-[filter] duration-700 ${clear ? "" : "scale-110 blur-2xl"}`}
      />
      {!remoteStream && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className="radar relative mx-auto size-14 rounded-full" />
            <p className="mt-6 text-sm text-ink-dim">
              Waiting for the stranger&rsquo;s camera…
            </p>
          </div>
        </div>
      )}

      {remoteStream && !clear && (
        <div className="absolute inset-0 grid place-items-center p-6">
          <div className="glass-strong anim-rise w-full max-w-sm rounded-[28px] p-6 text-center">
            <span className="text-3xl" aria-hidden="true">🛡️</span>
            <h2 className="mt-3 text-lg font-semibold tracking-tight">
              {reveal.mine
                ? "Waiting for them to reveal…"
                : reveal.theirs
                  ? "They're ready to be seen"
                  : "You're both blurred"}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-dim">
              {reveal.mine
                ? "Your camera turns clear only once they reveal too. You can change your mind."
                : "You can hear each other. Cameras turn clear only when you both tap Reveal."}
            </p>
            <div className="mt-4 flex justify-center gap-2 text-xs">
              <Consent who="You" ok={reveal.mine} />
              <Consent who="Stranger" ok={reveal.theirs} />
            </div>
            <button
              onClick={onToggleReveal}
              className={`mt-5 h-12 w-full rounded-full text-sm font-semibold ${reveal.mine ? "btn-ghost" : "btn-primary"}`}
            >
              {reveal.mine ? "Stay blurred" : "Reveal my camera"}
            </button>
          </div>
        </div>
      )}

      {/* Soft vignette so controls stay legible over bright video. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/70 to-transparent" />

      {/* Local (picture-in-picture), mirrored like a real mirror. */}
      <div className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] h-44 w-32 overflow-hidden rounded-2xl border border-white/15 bg-zinc-900 shadow-2xl md:h-56 md:w-40">
        <video
          ref={localRef}
          autoPlay
          playsInline
          muted
          className={`h-full w-full -scale-x-100 object-cover transition-opacity ${camOn ? "" : "opacity-0"}`}
        />
        {!camOn && (
          <div className="absolute inset-0 grid place-items-center text-ink-faint">
            <VideoOffIcon />
          </div>
        )}
        <span className="absolute inset-x-0 bottom-0 bg-black/55 py-1 text-center text-[10px] font-medium text-white/85">
          {clear ? "They see you" : "They see this blur"}
        </span>
      </div>

      <div className="glass absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full p-2">
        <ControlButton
          on={micOn}
          onClick={() => toggle("audio")}
          label={micOn ? "Mute microphone" : "Unmute microphone"}
        >
          {micOn ? <MicIcon /> : <MicOffIcon />}
        </ControlButton>
        <ControlButton
          on={camOn}
          onClick={() => toggle("video")}
          label={camOn ? "Turn camera off" : "Turn camera on"}
        >
          {camOn ? <VideoIcon /> : <VideoOffIcon />}
        </ControlButton>
        {clear && (
          <ControlButton
            on
            onClick={onToggleReveal}
            label="Blur my camera again"
          >
            <ShieldIcon />
          </ControlButton>
        )}
        <button
          onClick={onEnd}
          aria-label="End video and return to chat"
          title="End video"
          className="btn-danger flex h-12 items-center gap-2 rounded-full px-5 text-sm font-semibold"
        >
          <PhoneOffIcon />
          <span className="hidden sm:inline">End video</span>
        </button>
      </div>
    </div>
  );
}

function ControlButton({
  on,
  onClick,
  label,
  children,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={!on}
      title={label}
      className={`grid size-12 place-items-center rounded-full transition ${
        on ? "btn-ghost" : "bg-white text-black"
      }`}
    >
      {children}
    </button>
  );
}

function Consent({ who, ok }: { who: string; ok: boolean }) {
  return (
    <span
      className={`rounded-full border px-3 py-1 ${ok ? "border-accent/50 text-accent" : "border-line text-ink-faint"}`}
    >
      {ok ? "✓" : "…"} {who}
    </span>
  );
}
