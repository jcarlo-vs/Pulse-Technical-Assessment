"use client";

import { useEffect, useRef, useState } from "react";
import { PhoneOffIcon, SendIcon, VideoIcon } from "./icons";

export interface ChatMessage {
  id: number;
  mine: boolean;
  text: string;
}

const MAX_LEN = 1000;

// Bottom sheet on phones, floating side panel on desktop so the globe stays
// visible behind the conversation.
export default function ChatPanel({
  messages,
  connected,
  videoBusy,
  color,
  onSend,
  onStartVideo,
  onEnd,
}: {
  messages: ChatMessage[];
  connected: boolean;
  videoBusy: boolean;
  color: string;
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
          <p className="font-semibold leading-tight">Stranger</p>
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
          <div className="anim-fade mx-auto mt-6 max-w-[260px] text-center">
            <p className="text-sm font-medium">
              {connected ? "You're connected 👋" : "Opening a private line…"}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-faint">
              Messages travel directly between you two and vanish when either of
              you leaves.
            </p>
          </div>
        )}
        {messages.map((m, i) => {
          const prevSame = i > 0 && messages[i - 1].mine === m.mine;
          return (
            <div
              key={m.id}
              className={`anim-rise flex ${m.mine ? "justify-end" : "justify-start"} ${prevSame ? "" : "pt-2"}`}
            >
              <span
                className={`max-w-[80%] whitespace-pre-wrap break-words px-4 py-2.5 text-[15px] leading-snug ${
                  m.mine
                    ? "rounded-[20px] rounded-br-md bg-gradient-to-br from-accent to-[#5ee0f0] text-[#04120d]"
                    : "rounded-[20px] rounded-bl-md bg-white/[0.08] text-ink"
                }`}
              >
                {m.text}
              </span>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={submit}
        className="flex items-center gap-2 border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={MAX_LEN}
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
