"use client";

import { useEffect, useRef, useState } from "react";
import { ImageIcon, PhoneOffIcon, SendIcon, VideoIcon } from "./icons";
import { MAX_CHAT_LEN } from "@/lib/webrtc";
import type { Vibe } from "@/lib/vibes";

export interface ChatMessage {
  id: number;
  mine: boolean;
  text: string;
  photo?: string; // object URL; the photo itself only ever lived in memory
}

// Bottom sheet on phones, floating side panel on desktop so the globe stays
// visible behind the conversation.
export default function ChatPanel({
  messages,
  connected,
  videoBusy,
  color,
  vibe,
  icebreaker,
  onShuffle,
  onSendPhoto,
  onSend,
  onStartVideo,
  onEnd,
}: {
  messages: ChatMessage[];
  connected: boolean;
  videoBusy: boolean;
  color: string;
  vibe: Vibe;
  icebreaker: string;
  onShuffle: () => void;
  onSendPhoto: (file: File) => void;
  onSend: (text: string) => void;
  onStartVideo: () => void;
  onEnd: () => void;
}) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    if (connected) inputRef.current?.focus();
  }, [connected]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !connected) return;
    onSend(text);
    setDraft("");
  }

  return (
    <section
      aria-label="Chat with stranger"
      className="glass-strong anim-chat absolute inset-x-0 bottom-0 z-30 flex h-[72dvh] flex-col rounded-t-[28px] md:inset-x-auto md:bottom-4 md:right-4 md:top-4 md:h-auto md:w-[400px] md:rounded-[28px]"
    >
      <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/15 md:hidden" />

      <header className="flex items-center gap-3 border-b border-line px-5 py-4">
        <span
          className="size-10 shrink-0 rounded-full"
          style={{
            background: `radial-gradient(circle at 30% 30%, white, ${color} 45%, color-mix(in srgb, ${color} 40%, black))`,
            boxShadow: `0 0 20px -2px ${color}`,
          }}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-semibold leading-tight">
            Stranger
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}
            >
              {vibe.emoji} {vibe.label}
            </span>
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-dim">
            <span
              className={`size-1.5 rounded-full ${connected ? "bg-accent shadow-[0_0_8px_var(--accent)]" : "animate-pulse bg-amber-300"}`}
            />
            {connected ? "Connected · peer-to-peer" : "Connecting…"}
          </p>
        </div>
        <button
          onClick={onStartVideo}
          disabled={!connected || videoBusy}
          aria-label="Start video call"
          title="Video call"
          className="btn-ghost grid size-10 place-items-center rounded-full disabled:opacity-35"
        >
          <VideoIcon />
        </button>
        <button
          onClick={onEnd}
          aria-label="End conversation"
          title="End"
          className="btn-danger grid size-10 place-items-center rounded-full"
        >
          <PhoneOffIcon />
        </button>
      </header>

      <div
        className="flex-1 space-y-1.5 overflow-y-auto px-4 py-5"
        aria-live="polite"
      >
        {messages.length === 0 && (
          <div className="anim-fade mx-auto mt-6 max-w-[290px] text-center">
            <p className="text-sm font-medium">
              {connected ? "You're connected 👋" : "Opening a private line…"}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-faint">
              Messages travel directly between you two and vanish when either of
              you leaves.
            </p>
            {connected && icebreaker && (
              <div className="mt-6 text-left">
                <p className="mb-2 text-center text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint">
                  Not sure what to say?
                </p>
                <button
                  onClick={() => {
                    setDraft(icebreaker);
                    inputRef.current?.focus();
                  }}
                  className="w-full rounded-2xl border px-4 py-3 text-left text-sm leading-snug transition hover:bg-white/[0.06]"
                  style={{ borderColor: `color-mix(in srgb, ${color} 45%, transparent)` }}
                >
                  <span className="mr-1.5">{vibe.emoji}</span>
                  {icebreaker}
                  <span className="mt-1 block text-[11px] text-ink-faint">
                    Tap to use it
                  </span>
                </button>
                <button
                  onClick={onShuffle}
                  className="mx-auto mt-2 block text-xs text-ink-faint underline-offset-4 hover:text-ink-dim hover:underline"
                >
                  Another one
                </button>
              </div>
            )}
          </div>
        )}
        {messages.map((m, i) => {
          const prevSame = i > 0 && messages[i - 1].mine === m.mine;
          return (
            <div
              key={m.id}
              className={`anim-rise flex ${m.mine ? "justify-end" : "justify-start"} ${prevSame ? "" : "pt-2"}`}
            >
              {m.photo ? (
                <Photo src={m.photo} mine={m.mine} />
              ) : (
                <span
                  className={`max-w-[80%] whitespace-pre-wrap break-words px-4 py-2.5 text-[15px] leading-snug ${
                    m.mine
                      ? "rounded-[20px] rounded-br-md bg-gradient-to-br from-accent to-[#5ee0f0] text-[#04120d]"
                      : "rounded-[20px] rounded-bl-md bg-white/[0.08] text-ink"
                  }`}
                >
                  {m.text}
                </span>
              )}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={submit}
        className="flex items-center gap-2 border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <label
          title="Send a photo (under 5 MB)"
          className={`btn-ghost grid size-12 shrink-0 cursor-pointer place-items-center rounded-full ${connected ? "" : "pointer-events-none opacity-35"}`}
        >
          <ImageIcon />
          <span className="sr-only">Send a photo</span>
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={!connected}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = ""; // allow re-sending the same file
              if (file) onSendPhoto(file);
            }}
          />
        </label>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={MAX_CHAT_LEN}
          placeholder={connected ? "Say something nice…" : "Connecting…"}
          disabled={!connected}
          aria-label="Message"
          className="h-12 flex-1 rounded-full border border-line bg-white/[0.05] px-5 text-[15px] outline-none transition placeholder:text-ink-faint focus:border-accent/50 focus:bg-white/[0.08] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!connected || !draft.trim()}
          aria-label="Send"
          className="btn-primary grid size-12 shrink-0 place-items-center rounded-full disabled:opacity-35"
        >
          <SendIcon />
        </button>
      </form>
    </section>
  );
}

// Received photos arrive blurred: nobody gets surprised by an image they
// didn't choose to see. Your own photos show as sent.
function Photo({ src, mine }: { src: string; mine: boolean }) {
  const [shown, setShown] = useState(mine);
  return (
    <button
      type="button"
      onClick={() => (shown ? window.open(src, "_blank", "noopener") : setShown(true))}
      aria-label={shown ? "Open photo" : "Photo from stranger, tap to view"}
      className={`relative max-w-[70%] overflow-hidden rounded-[20px] ${mine ? "rounded-br-md" : "rounded-bl-md"} border border-line`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- in-memory blob URL */}
      <img
        src={src}
        alt=""
        className={`block max-h-72 w-full object-cover transition duration-500 ${shown ? "" : "scale-110 blur-2xl"}`}
      />
      {!shown && (
        <span className="absolute inset-0 grid place-items-center bg-black/30 text-sm font-medium text-white">
          🛡️ Tap to view
        </span>
      )}
    </button>
  );
}
