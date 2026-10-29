"use client";

import { useEffect, useRef, useState } from "react";
import {
  CloseIcon,
  ImageIcon,
  MicIcon,
  PhoneOffIcon,
  SendIcon,
  VideoIcon,
} from "./icons";
import { MAX_CHAT_LEN, MAX_PINS, REACTIONS, UNDO_MS } from "@/lib/webrtc";
import { MAX_VOICE_SECONDS, startRecording, type Recording } from "@/lib/voice";
import type { Vibe } from "@/lib/vibes";

export interface ChatMessage {
  id: number; // local React key
  wid: string; // shared with the peer, for undo / react
  at: number; // sent or received, ms
  mine: boolean;
  text: string;
  photo?: string; // object URL; the photo itself only ever lived in memory
  voice?: { src: string; seconds: number };
  unsent?: boolean;
  myReact?: string; // one of REACTIONS
  theirReact?: string;
  replyTo?: string; // wid of the message this answers
}

// Bottom sheet on phones, floating side panel on desktop so the globe stays
// visible behind the conversation.
export default function ChatPanel({
  messages,
  connected,
  videoBusy,
  color,
  vibe,
  where,
  icebreaker,
  onShuffle,
  onSendPhoto,
  onSendVoice,
  onUnsend,
  onReact,
  pinned,
  onPins,
  onSend,
  onStartVideo,
  onEnd,
  overVideo,
  onHide,
}: {
  messages: ChatMessage[];
  connected: boolean;
  videoBusy: boolean;
  color: string;
  vibe: Vibe;
  where: string;
  icebreaker: string;
  onShuffle: () => void;
  onSendPhoto: (file: File) => void;
  onSendVoice: (voice: Blob, seconds: number) => void;
  onUnsend: (m: ChatMessage) => void;
  onReact: (m: ChatMessage, emoji: string) => void;
  pinned: ChatMessage[];
  onPins: (wids: string[]) => void;
  onSend: (text: string, replyTo?: string) => void;
  onStartVideo: () => void;
  onEnd: () => void;
  // During a video call on phones: sit above the video, with a way back.
  overVideo?: boolean;
  onHide?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [recording, setRecording] = useState<{ startedAt: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [voiceError, setVoiceError] = useState("");
  const recRef = useRef<Recording | null>(null);
  // Which message's popover is open (reactions or "more"), and a clock for
  // the undo countdown.
  // `down`: open below the button when it's near the top of the list, so
  // the popover isn't clipped under the header.
  const [menu, setMenu] = useState<{ id: number; kind: "react" | "more"; down: boolean } | null>(
    null,
  );
  const listRef = useRef<HTMLDivElement>(null);
  const [pinLimit, setPinLimit] = useState<ChatMessage | null>(null);
  const [pinsOpen, setPinsOpen] = useState(false);
  const [flash, setFlash] = useState<number | null>(null);
  const pinnedIds = pinned.map((p) => p.wid);

  // Close any open popover on a click outside it (or Escape). A document
  // listener, because a fixed "backdrop" inside an animated row only covers
  // that row. Popovers and their toggles carry data-popover.
  const anyOpen = menu !== null || pinsOpen;
  useEffect(() => {
    if (!anyOpen) return;
    const close = () => {
      setMenu(null);
      setPinsOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.("[data-popover]")) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [anyOpen]);
  function togglePin(m: ChatMessage) {
    if (pinnedIds.includes(m.wid)) onPins(pinnedIds.filter((w) => w !== m.wid));
    else if (pinnedIds.length < MAX_PINS) onPins([...pinnedIds, m.wid]);
    else setPinLimit(m);
  }
  function jumpTo(m: ChatMessage) {
    setPinsOpen(false);
    document.getElementById(`msg-${m.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(m.id);
    setTimeout(() => setFlash((f) => (f === m.id ? null : f)), 1600);
  }
  const [now, setNow] = useState(0);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [toast, setToast] = useState("");
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(t);
  }, [toast]);
  const byWid = (wid?: string) => messages.find((x) => x.wid === wid);
  const toggle = (id: number, kind: "react" | "more", el: HTMLElement) => {
    if (menu?.id === id && menu.kind === kind) return setMenu(null);
    const top = listRef.current?.getBoundingClientRect().top ?? 0;
    setMenu({ id, kind, down: el.getBoundingClientRect().top - top < 190 });
  };
  useEffect(() => {
    if (menu === null) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [menu]);

  async function startVoice() {
    setVoiceError("");
    try {
      recRef.current = await startRecording();
      setElapsed(0);
      setRecording({ startedAt: Date.now() });
    } catch (e) {
      setVoiceError(e instanceof Error ? e.message : "Couldn't start recording.");
    }
  }

  async function finishVoice(keep: boolean) {
    const rec = recRef.current;
    const startedAt = recording?.startedAt ?? Date.now();
    recRef.current = null;
    setRecording(null);
    if (!rec) return;
    const blob = await rec.stop(keep);
    const seconds = Math.min(
      MAX_VOICE_SECONDS,
      Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
    );
    if (blob) onSendVoice(blob, seconds);
  }

  // Ticks the timer and auto-sends at the limit.
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => {
      const s = (Date.now() - recording.startedAt) / 1000;
      setElapsed(Math.floor(s));
      if (s >= MAX_VOICE_SECONDS) void finishVoice(true);
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- finishVoice reads refs
  }, [recording]);

  // Never leave the mic open: drop an unsent note if the panel goes away.
  useEffect(() => () => void recRef.current?.stop(false), []);

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
    onSend(text, replyTo?.wid);
    setDraft("");
    setReplyTo(null);
  }

  return (
    <section
      aria-label="Chat with stranger"
      className={`glass-strong anim-chat absolute inset-x-0 bottom-0 ${overVideo ? "z-50" : "z-30"} flex h-[72dvh] flex-col rounded-t-[28px] md:inset-x-auto md:bottom-4 md:right-4 md:top-4 md:h-auto md:z-30 md:w-[400px] md:rounded-[28px]`}
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
            <span className="truncate">
              {connected ? where || "Connected · peer-to-peer" : "Connecting…"}
            </span>
          </p>
        </div>
        {onHide && (
          <button
            onClick={onHide}
            aria-label="Back to video"
            title="Back to video"
            className="btn-ghost grid size-10 place-items-center rounded-full md:hidden"
          >
            <VideoIcon />
          </button>
        )}
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

      {pinned.length > 0 && (
        <div className="relative border-b border-line">
          <button
            type="button"
            data-popover
            onClick={() => setPinsOpen(!pinsOpen)}
            aria-expanded={pinsOpen}
            className="anim-fade flex w-full items-center gap-2.5 bg-white/[0.03] px-5 py-2 text-left text-sm hover:bg-white/[0.06]"
          >
            <span aria-hidden="true">📌</span>
            <span className="min-w-0 flex-1 truncate">
              <span className="text-ink-faint">Pinned · </span>
              {preview(pinned[pinned.length - 1])}
            </span>
            <span className="rounded-full bg-white/[0.08] px-2 text-xs tabular-nums text-ink-dim">
              {pinned.length}/{MAX_PINS}
            </span>
          </button>
          {pinsOpen && (
            <>
              <ul data-popover className="glass-strong menu-in absolute inset-x-3 top-full z-20 mt-1 rounded-2xl p-1.5 text-sm">
                {pinned.map((p) => (
                  <li key={p.wid} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => jumpTo(p)}
                      className="min-w-0 flex-1 truncate rounded-xl px-3 py-2 text-left hover:bg-white/10"
                    >
                      <span className="mr-1.5 text-xs text-ink-faint">{p.mine ? "You" : "Stranger"}</span>
                      {preview(p)}
                    </button>
                    <button
                      type="button"
                      onClick={() => onPins(pinnedIds.filter((w) => w !== p.wid))}
                      aria-label="Unpin"
                      title="Unpin"
                      className="grid size-8 shrink-0 place-items-center rounded-full text-ink-faint hover:bg-white/10 hover:text-ink"
                    >
                      <CloseIcon width={14} height={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {pinLimit && (
        <div className="anim-fade absolute inset-0 z-40 grid place-items-center rounded-[inherit] bg-black/55 p-5" role="dialog" aria-modal="true" aria-labelledby="pin-limit-title">
          <div className="glass-strong anim-pop w-full max-w-sm rounded-3xl p-5">
            <p id="pin-limit-title" className="font-semibold">You can pin up to {MAX_PINS} messages</p>
            <p className="mt-1 text-sm text-ink-dim">Remove one, and this message takes its place.</p>
            <ul className="mt-4 space-y-1.5">
              {pinned.map((p) => (
                <li key={p.wid} className="flex items-center gap-2 rounded-2xl border border-line px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{preview(p)}</span>
                  <button
                    type="button"
                    onClick={() => {
                      onPins([...pinnedIds.filter((w) => w !== p.wid), pinLimit.wid]);
                      setPinLimit(null);
                    }}
                    className="btn-ghost h-8 shrink-0 rounded-full px-3 text-xs font-medium"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setPinLimit(null)}
              className="btn-ghost mt-4 h-11 w-full rounded-full text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div
        ref={listRef}
        className="scroll-slim flex-1 space-y-1.5 overflow-y-auto px-4 py-5"
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
              id={`msg-${m.id}`}
              // Popovers anchor to this full-width row so they never spill out
              // of the panel; the open row sits above the later messages.
              className={`anim-rise relative flex rounded-2xl ${menu?.id === m.id ? "z-30" : ""} transition-colors duration-700 ${flash === m.id ? "bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]" : ""} ${m.mine ? "justify-end" : "justify-start"} ${prevSame ? "" : "pt-2"}`}
            >
              {m.unsent ? (
                <span className="rounded-[20px] border border-dashed border-line px-4 py-2 text-sm italic text-ink-faint">
                  {m.mine ? "You unsent a message" : "Message removed"}
                </span>
              ) : (
                <div className={`flex max-w-[85%] flex-col ${m.mine ? "items-end" : "items-start"}`}>
                  {m.replyTo && (
                    <Quote of={byWid(m.replyTo)} mine={m.mine} />
                  )}
                  <div
                    className={`group flex items-center gap-1 ${m.mine ? "flex-row-reverse" : ""}`}
                  >
                    {/* Double-click hearts it, like Messenger. */}
                    <div
                      className={`relative min-w-0 ${m.myReact || m.theirReact ? "mb-2.5" : ""}`}
                      onDoubleClick={() => onReact(m, m.myReact === "❤️" ? "" : "❤️")}
                    >
                      {m.photo ? (
                        <Photo src={m.photo} mine={m.mine} />
                      ) : m.voice ? (
                        <VoiceNote {...m.voice} mine={m.mine} />
                      ) : (
                        <span
                          className={`block whitespace-pre-wrap break-words px-4 py-2.5 text-[15px] leading-snug ${
                            m.mine
                              ? "rounded-[20px] rounded-br-md bg-gradient-to-br from-accent to-[var(--accent-end)] text-[var(--accent-ink)]"
                              : "rounded-[20px] rounded-bl-md bg-white/[0.08] text-ink"
                          }`}
                        >
                          {m.text}
                        </span>
                      )}
                      {(m.myReact || m.theirReact) && (
                        <span
                          className={`anim-pop absolute -bottom-3 ${m.mine ? "left-1" : "right-1"} flex items-center rounded-full border border-line bg-[var(--glass-strong)] px-1.5 text-xs leading-5`}
                          aria-label={`Reactions: ${[m.myReact, m.theirReact].filter(Boolean).join(" ")}`}
                        >
                          {[...new Set([m.myReact, m.theirReact].filter(Boolean))].join("")}
                          {m.myReact && m.theirReact && <span className="ml-1 text-ink-faint">2</span>}
                        </span>
                      )}
                    </div>

                    {/* Hover actions (always faintly visible on touch screens). */}
                    <div
                      className={`flex shrink-0 items-center opacity-60 transition group-hover:opacity-100 md:opacity-0 ${menu?.id === m.id ? "!opacity-100" : ""} ${m.mine ? "flex-row-reverse" : ""}`}
                    >
                      <Action label="React" onClick={(e) => toggle(m.id, "react", e.currentTarget)} active={menu?.id === m.id && menu.kind === "react"}>
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5s1.2 1.8 3.5 1.8 3.5-1.8 3.5-1.8M9 9.5h.01M15 9.5h.01" /></svg>
                      </Action>
                      <Action
                        label="Reply"
                        onClick={() => {
                          setReplyTo(m);
                          setMenu(null);
                          inputRef.current?.focus();
                        }}
                      >
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 6 6v4" /></svg>
                      </Action>
                      <Action label="More" onClick={(e) => toggle(m.id, "more", e.currentTarget)} active={menu?.id === m.id && menu.kind === "more"}>
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>
                      </Action>

                      {menu?.id === m.id && (
                        <>
                          {menu.kind === "react" ? (
                            <div
                              data-popover
                              role="menu"
                              aria-label="React"
                              className={`menu-in absolute z-20 border border-line bg-[var(--bg)] shadow-2xl flex gap-0.5 rounded-full p-1 ${menu.down ? "top-full mt-1" : "bottom-full mb-1"} ${m.mine ? "right-0" : "left-0"}`}
                            >
                              {REACTIONS.map((e) => (
                                <button
                                  key={e}
                                  type="button"
                                  role="menuitem"
                                  aria-label={`React ${e}`}
                                  onClick={() => {
                                    onReact(m, m.myReact === e ? "" : e);
                                    setMenu(null);
                                  }}
                                  className={`grid size-10 place-items-center rounded-full text-2xl transition hover:-translate-y-1 hover:scale-125 ${m.myReact === e ? "bg-white/15" : ""}`}
                                >
                                  {e}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div
                              data-popover
                              role="menu"
                              className={`menu-in absolute z-20 border border-line bg-[var(--bg)] shadow-2xl w-48 rounded-2xl p-1.5 text-sm ${menu.down ? "top-full mt-1" : "bottom-full mb-1"} ${m.mine ? "right-0" : "left-0"}`}
                            >
                              <MenuItem
                                onClick={() => {
                                  togglePin(m);
                                  setMenu(null);
                                }}
                              >
                                <span aria-hidden="true">📌</span>
                                {pinnedIds.includes(m.wid) ? "Unpin" : "Pin"}
                              </MenuItem>
                              {m.mine && (
                                <MenuItem
                                  onClick={() => {
                                    setMenu(null);
                                    if (now - m.at > UNDO_MS) {
                                      setToast("You can only undo a message within 30 seconds.");
                                    } else {
                                      onUnsend(m);
                                      if (replyTo?.wid === m.wid) setReplyTo(null);
                                    }
                                  }}
                                >
                                  <span aria-hidden="true">↩️</span>
                                  Undo send
                                  {now - m.at <= UNDO_MS && (
                                    <span className="ml-auto tabular-nums text-xs text-ink-faint">
                                      {Math.ceil((UNDO_MS - (now - m.at)) / 1000)}s
                                    </span>
                                  )}
                                </MenuItem>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {toast && (
        <p
          role="alert"
          className="anim-pop mx-4 mb-2 flex items-center gap-2 rounded-2xl border border-line bg-[var(--glass-strong)] px-4 py-2.5 text-sm shadow-xl"
        >
          <span aria-hidden="true">🔒</span>
          {toast}
        </p>
      )}
      {replyTo && !recording && (
        <div className="anim-fade flex items-start gap-3 border-t border-line px-5 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold">
              Replying to {replyTo.mine ? "yourself" : "Stranger"}
            </p>
            <p className="truncate text-xs text-ink-dim">{preview(replyTo)}</p>
          </div>
          <button
            type="button"
            onClick={() => setReplyTo(null)}
            aria-label="Cancel reply"
            className="grid size-7 shrink-0 place-items-center rounded-full text-ink-faint hover:bg-white/10 hover:text-ink"
          >
            <CloseIcon width={14} height={14} />
          </button>
        </div>
      )}
      {voiceError && (
        <p role="alert" className="border-t border-line px-5 pt-2 text-xs text-amber-300">
          {voiceError}
        </p>
      )}
      {recording ? (
        <div className="flex items-center gap-2 border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => void finishVoice(false)}
            aria-label="Cancel voice note"
            title="Cancel"
            className="btn-ghost grid size-12 shrink-0 place-items-center rounded-full"
          >
            <CloseIcon />
          </button>
          <div
            className="flex h-12 flex-1 items-center gap-3 rounded-full border border-line bg-white/[0.05] px-5 text-[15px]"
            role="timer"
            aria-label="Recording voice note"
          >
            <span className="size-2.5 animate-pulse rounded-full bg-red-500" />
            <span className="tabular-nums">{clock(elapsed)}</span>
            <span className="text-xs text-ink-faint">/ {clock(MAX_VOICE_SECONDS)}</span>
            <span className="ml-auto h-1 w-16 overflow-hidden rounded-full bg-white/10">
              <span
                className="block h-full bg-red-500 transition-[width] duration-300"
                style={{ width: `${(elapsed / MAX_VOICE_SECONDS) * 100}%` }}
              />
            </span>
          </div>
          <button
            type="button"
            onClick={() => void finishVoice(true)}
            aria-label="Send voice note"
            className="btn-primary grid size-12 shrink-0 place-items-center rounded-full"
          >
            <SendIcon />
          </button>
        </div>
      ) : (
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
        {draft.trim() ? (
          <button
            type="submit"
            disabled={!connected}
            aria-label="Send"
            className="btn-primary grid size-12 shrink-0 place-items-center rounded-full disabled:opacity-35"
          >
            <SendIcon />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void startVoice()}
            disabled={!connected}
            aria-label={`Record a voice note (up to ${MAX_VOICE_SECONDS} seconds)`}
            title={`Voice note, up to ${MAX_VOICE_SECONDS}s`}
            className="btn-primary grid size-12 shrink-0 place-items-center rounded-full disabled:opacity-35"
          >
            <MicIcon />
          </button>
        )}
      </form>
      )}
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

function clock(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Never autoplays: a stranger's voice only plays when you tap it.
function VoiceNote({ src, seconds, mine }: { src: string; seconds: number; mine: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  return (
    <button
      type="button"
      onClick={() => {
        const a = ref.current;
        if (!a) return;
        if (a.paused) void a.play().catch(() => {});
        else a.pause();
      }}
      aria-label={`${mine ? "Your" : "Stranger's"} voice note, ${seconds} seconds, ${playing ? "pause" : "play"}`}
      className={`flex w-56 max-w-[80%] items-center gap-3 px-4 py-2.5 text-sm ${
        mine
          ? "rounded-[20px] rounded-br-md bg-gradient-to-br from-accent to-[var(--accent-end)] text-[var(--accent-ink)]"
          : "rounded-[20px] rounded-bl-md bg-white/[0.08] text-ink"
      }`}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-black/15 text-xs">
        {playing ? "❚❚" : "▶"}
      </span>
      <span className="h-1 flex-1 overflow-hidden rounded-full bg-current/20">
        <span
          className="block h-full bg-current"
          style={{ width: `${progress * 100}%` }}
        />
      </span>
      <span className="tabular-nums text-xs opacity-80">{clock(seconds)}</span>
      <audio
        ref={ref}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
        // Recorder output often lacks a duration header, so use our own.
        onTimeUpdate={(e) =>
          setProgress(Math.min(1, e.currentTarget.currentTime / seconds))
        }
      />
    </button>
  );
}

// One-line summary of a message, for the pinned bar and reply quotes.
function preview(m: ChatMessage): string {
  if (m.unsent) return "Message removed";
  if (m.photo) return "📷 Photo";
  if (m.voice) return "🎙️ Voice message";
  return m.text;
}

function Quote({ of, mine }: { of?: ChatMessage; mine: boolean }) {
  const label = !of
    ? "Replied to a message"
    : mine
      ? of.mine
        ? "You replied to yourself"
        : "You replied to Stranger"
      : of.mine
        ? "Stranger replied to you"
        : "Stranger replied to themselves";
  return (
    <div className={`mb-0.5 flex max-w-full flex-col ${mine ? "items-end" : "items-start"}`}>
      <span className="flex items-center gap-1 px-2 text-[11px] text-ink-faint">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 6 6v4" /></svg>
        {label}
      </span>
      <span className="line-clamp-2 max-w-full rounded-[18px] bg-white/[0.05] px-3.5 pb-4 pt-2 text-[13px] text-ink-dim">
        {of ? preview(of) : "Message unavailable"}
      </span>
    </div>
  );
}

function Action({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      // Toggles count as "inside", so clicking one doesn't close-then-reopen.
      data-popover
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-expanded={active}
      className={`grid size-8 place-items-center rounded-full text-ink-faint transition hover:bg-white/10 hover:text-ink ${active ? "bg-white/10 text-ink" : ""}`}
    >
      {children}
    </button>
  );
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left hover:bg-white/10"
    >
      {children}
    </button>
  );
}
