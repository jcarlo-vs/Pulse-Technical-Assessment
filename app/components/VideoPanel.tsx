"use client";

import { useEffect, useRef, useState } from "react";
import {
  MicIcon,
  MicOffIcon,
  PhoneOffIcon,
  VideoIcon,
  VideoOffIcon,
} from "./icons";

export default function VideoPanel({
  localStream,
  remoteStream,
  onEnd,
}: {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onEnd: () => void;
}) {
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
    if (remoteRef.current && remoteRef.current.srcObject !== remoteStream) {
      remoteRef.current.srcObject = remoteStream;
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
      <video
        ref={remoteRef}
        autoPlay
        playsInline
        className="h-full w-full object-cover"
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
