"use client";

import { useEffect, useRef, useState } from "react";
import {
  MicIcon,
  MicOffIcon,
  PhoneOffIcon,
  ShieldIcon,
  VideoIcon,
  VideoOffIcon,
  ChatIcon,
} from "./icons";

export default function VideoPanel({
  localStream,
  remoteStream,
  privacy,
  onToggleShowMe,
  onEnd,
  onOpenChat,
  unread,
}: {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  privacy: { showMe: boolean; theyShow: boolean };
  onToggleShowMe: () => void;
  onEnd: () => void;
  onOpenChat: () => void;
  unread: boolean;
}) {
  const { showMe, theyShow } = privacy;
  // Intro card until the user shows themselves or dismisses it.
  const [introDone, setIntroDone] = useState(false);
  const showIntro = !introDone && !showMe;
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  // Muted, blurred copy of the remote video that fills the bars when the
  // picture is a different shape from the screen (laptop video on a phone).
  const backdropRef = useRef<HTMLVideoElement>(null);
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
    const bg = backdropRef.current;
    if (bg && bg.srcObject !== remoteStream) {
      bg.srcObject = remoteStream;
      void bg.play().catch(() => {});
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
    // Desktop leaves room on the right so the chat stays visible beside the
    // video; phones open it as a sheet from the chat button.
    <div className="anim-fade absolute inset-0 z-40 bg-black md:right-[432px] md:overflow-hidden md:rounded-r-[28px]">
      {/* Remote (full screen) */}
      {/* Also blurred on *your* screen until they choose to show themselves,
          regardless of what they send: a modified client can't flash you. */}
      <video
        ref={backdropRef}
        autoPlay
        playsInline
        muted
        aria-hidden="true"
        className="absolute inset-0 h-full w-full scale-125 object-cover opacity-60 blur-3xl md:hidden"
      />
      {/* Phones show the whole picture (no zoomed-in crop of a wide laptop
          camera), with the blurred copy behind it; wide screens fill. */}
      <video
        ref={remoteRef}
        autoPlay
        playsInline
        className={`relative h-full w-full object-contain transition-[filter] duration-700 md:object-cover ${theyShow ? "" : "scale-110 blur-2xl"}`}
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

      {remoteStream && (
        <p className="glass anim-fade absolute left-4 top-[max(1rem,env(safe-area-inset-top))] flex max-w-[calc(100%-11rem)] items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-xs">
          <span
            className={`size-1.5 rounded-full ${theyShow ? "bg-accent" : "bg-amber-300"}`}
          />
          {theyShow ? "Stranger is visible" : "Stranger is blurred"}
        </p>
      )}

      {remoteStream && showIntro && (
        <div className="absolute inset-0 grid place-items-center p-6">
          <div className="glass-strong anim-rise w-full max-w-sm rounded-[28px] p-6 text-center">
            <span className="text-3xl" aria-hidden="true">🛡️</span>
            <h2 className="mt-3 text-lg font-semibold tracking-tight">
              Both cameras start blurred
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-dim">
              You can already hear each other. Nobody is seen clearly until
              they choose to show themselves, and you can blur yourself again
              any time.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setIntroDone(true)}
                className="btn-ghost h-12 flex-1 rounded-full text-sm font-medium"
              >
                Not yet
              </button>
              <button
                onClick={onToggleShowMe}
                className="btn-primary h-12 flex-1 rounded-full text-sm"
              >
                Show me
              </button>
            </div>
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
          {showMe ? "They can see you" : "They see this blur"}
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
        <LabeledToggle
          active={showMe}
          onClick={onToggleShowMe}
          label={showMe ? "Blur me" : "Show me"}
          hint={showMe ? "Blur my camera" : "Let them see me clearly"}
        >
          <ShieldIcon />
        </LabeledToggle>
        <button
          onClick={onOpenChat}
          aria-label={unread ? "Open chat, new message" : "Open chat"}
          title="Chat"
          className="btn-ghost relative grid size-12 place-items-center rounded-full md:hidden"
        >
          <ChatIcon />
          {unread && (
            <span className="absolute right-2.5 top-2.5 size-2.5 rounded-full bg-danger ring-2 ring-black" />
          )}
        </button>
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

// Text-labelled on wider screens: a new concept, so an icon alone isn't
// enough.
function LabeledToggle({
  active,
  onClick,
  label,
  hint,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={hint}
      title={hint}
      className={`flex h-12 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition sm:px-4 ${
        active ? "btn-ghost text-accent" : "btn-ghost"
      }`}
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
