"use client";

import { useEffect, useRef, useState } from "react";
import EntryGate from "./components/EntryGate";
import WorldMap from "./components/WorldMap";
import VibeFilter from "./components/VibeFilter";
import ConnectionPrompt from "./components/ConnectionPrompt";
import ChatPanel, { type ChatMessage } from "./components/ChatPanel";
import VideoPanel from "./components/VideoPanel";
import ThemePicker from "./components/ThemePicker";
import { CloseIcon, PhoneOffIcon, VideoIcon } from "./components/icons";
import { join, leave, newSecret, poll, sendSignal, type Profile } from "@/lib/api";
import { DEFAULT_GENDER, DEFAULT_SEEKING, SEEKING, type Seeking } from "@/lib/match";
import {
  newMsgId,
  PeerSession,
  UNDO_MS,
  type DescType,
  type PeerControl,
} from "@/lib/webrtc";
import { POLL_INTERVAL_MS } from "@/lib/presence";
import { preparePhoto } from "@/lib/image";
import { countryCode, distanceKm, formatDistance, placeName } from "@/lib/geo";
import { startRing } from "@/lib/ring";
import { type Glance, type PeerDot, type SignalMsg } from "@/lib/types";
import { DEFAULT_VIBE, icebreaker, vibeOf, type VibeId } from "@/lib/vibes";

type Conn =
  | { kind: "idle" }
  | { kind: "requesting"; peerId: string }
  | { kind: "incoming"; peerId: string }
  | { kind: "connecting"; peerId: string }
  | { kind: "connected"; peerId: string };

type VideoState = "none" | "requesting" | "incoming" | "active";
// Consent-blur: every call starts fully blurred, then each person decides
// independently: whether to show themselves (blurred at the source, so it's
// enforced on their own device) and whether to see the other person clearly
// (a local-only blur on their own screen). Nobody can unblur someone else.
type Privacy = { showMe: boolean; theyShow: boolean };
const HIDDEN: Privacy = { showMe: false, theyShow: false };

const REQUEST_TIMEOUT_MS = 30_000;

export default function Home() {
  const [phase, setPhase] = useState<"gate" | "live">("gate");
  // Never shared with other users; our public id is sha256(secret), server-side.
  const [secret] = useState(newSecret);
  const [peers, setPeers] = useState<PeerDot[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notice, setNotice] = useState<{ id: number; text: string } | null>(
    null,
  );
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );

  const [conn, _setConn] = useState<Conn>({ kind: "idle" });
  const connRef = useRef<Conn>(conn);
  const setConn = (c: Conn) => {
    connRef.current = c;
    _setConn(c);
  };

  const [video, _setVideo] = useState<VideoState>("none");
  const videoRef = useRef<VideoState>(video);
  const setVideo = (v: VideoState) => {
    videoRef.current = v;
    _setVideo(v);
    if (v !== "active") setPrivacy(HIDDEN); // every call starts blurred
    setChatOverVideo(false);
    setUnread(false);
  };

  const [privacy, _setPrivacy] = useState<Privacy>(HIDDEN);
  const privacyRef = useRef<Privacy>(privacy);
  const setPrivacy = (p: Privacy) => {
    privacyRef.current = p;
    _setPrivacy(p);
    peerRef.current?.setVideoClear(p.showMe);
  };

  const [myVibe, setMyVibe] = useState<VibeId>(DEFAULT_VIBE);
  const [filter, setFilter] = useState<VibeId | null>(null);
  const [countryFilter, setCountryFilter] = useState<string | null>(null);
  const myCountry = useRef("");
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null);
  const [found, setFound] = useState<string | null>(null);
  // Phones: chat opens as a sheet over the video (desktop shows it beside).
  const [chatOverVideo, setChatOverVideo] = useState(false);
  const [unread, setUnread] = useState(false);
  const [pinned, setPinned] = useState<string[]>([]);
  const [confirmLeave, setConfirmLeave] = useState(false);
  // Coarse live activity for the entry screen (before joining).
  const [glance, setGlance] = useState<Glance | null>(null);
  const skipped = useRef<Set<string>>(new Set());
  // Rough place name of whoever we're calling / talking to.
  const [place, setPlace] = useState<{ peerId: string; name: string } | null>(null);
  const [promptTurn, setPromptTurn] = useState(0);

  // Our *offset* position, re-sent as-is if we get reaped and must re-join.
  // (The raw location is never kept after the first join.)
  const myLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const profileRef = useRef<Profile>({
    vibe: DEFAULT_VIBE,
    gender: DEFAULT_GENDER,
    seeking: DEFAULT_SEEKING,
  });
  // "Looking for" switch on the map; the next poll tells the server.
  const [seeking, _setSeeking] = useState<Seeking>(DEFAULT_SEEKING);
  const setSeeking = (s: Seeking) => {
    profileRef.current = { ...profileRef.current, seeking: s };
    _setSeeking(s);
  };
  const peerRef = useRef<PeerSession | null>(null);
  const msgId = useRef(0);
  // Object URLs for photos / voice notes in the current chat; revoked when it ends.
  const mediaUrls = useRef<string[]>([]);
  const requestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showNotice(text: string) {
    const id = Date.now();
    setNotice({ id, text });
    window.setTimeout(
      () => setNotice((n) => (n?.id === id ? null : n)),
      3500,
    );
  }

  function addMessage(
    mine: boolean,
    text: string,
    wid: string,
    extra?: Pick<ChatMessage, "photo" | "voice" | "replyTo">,
  ) {
    if (!mine) setUnread(true);
    setMessages((prev) => [
      ...prev,
      { id: msgId.current++, wid, at: Date.now(), mine, text, ...extra },
    ]);
  }

  const updateMessage = (match: (m: ChatMessage) => boolean, change: Partial<ChatMessage>) =>
    setMessages((prev) => prev.map((m) => (match(m) ? { ...m, ...change } : m)));
  const REMOVED = { unsent: true, text: "", photo: undefined, voice: undefined };

  // Undo send: only my own message, only within the window.
  function unsendMessage(m: ChatMessage) {
    if (!m.mine || Date.now() - m.at > UNDO_MS) return;
    peerRef.current?.sendUnsend(m.wid);
    updateMessage((x) => x.id === m.id, REMOVED);
  }

  function reactMessage(m: ChatMessage, emoji: string) {
    peerRef.current?.sendReact(m.wid, emoji);
    updateMessage((x) => x.id === m.id, { myReact: emoji || undefined });
  }

  // Up to MAX_PINS pinned messages, shared with the other person.
  function setPins(ids: string[]) {
    peerRef.current?.sendPins(ids);
    setPinned(ids);
  }

  // In-memory URL for a photo or voice note, revoked when the chat ends.
  function mediaUrl(blob: Blob) {
    const url = URL.createObjectURL(blob);
    mediaUrls.current.push(url);
    return url;
  }

  async function sendPhoto(file: File) {
    const ps = peerRef.current;
    if (!ps) return;
    try {
      const photo = await preparePhoto(file);
      const wid = newMsgId();
      await ps.sendFile("photo", photo, wid);
      addMessage(true, "", wid, { photo: mediaUrl(photo) });
    } catch (e) {
      showNotice(e instanceof Error ? e.message : "Couldn't send that photo.");
    }
  }

  async function sendVoice(voice: Blob, seconds: number) {
    const ps = peerRef.current;
    if (!ps) return;
    try {
      const wid = newMsgId();
      await ps.sendFile("voice", voice, wid, seconds);
      addMessage(true, "", wid, { voice: { src: mediaUrl(voice), seconds } });
    } catch (e) {
      showNotice(e instanceof Error ? e.message : "Couldn't send that voice note.");
    }
  }

  function teardown(message?: string) {
    if (requestTimer.current) clearTimeout(requestTimer.current);
    peerRef.current?.close();
    peerRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setVideo("none");
    setMessages([]);
    setPinned([]);
    mediaUrls.current.forEach((u) => URL.revokeObjectURL(u));
    mediaUrls.current = [];
    setConn({ kind: "idle" });
    if (message) showNotice(message);
  }

  function startPeer(peerId: string, initiator: boolean) {
    const ps = new PeerSession(initiator, {
      onSignal: (type: DescType, payload: string) => {
        void sendSignal(secret, peerId, type, payload);
      },
      onChat: (text, wid, replyTo) => addMessage(false, text, wid, { replyTo }),
      onPhoto: (photo, wid) => addMessage(false, "", wid, { photo: mediaUrl(photo) }),
      onVoice: (voice, seconds, wid) =>
        addMessage(false, "", wid, { voice: { src: mediaUrl(voice), seconds } }),
      // Their undo: honoured only for their own message, inside the window
      // (plus a little slack for delivery), so it can't erase old history.
      onUnsend: (wid) =>
        updateMessage(
          (m) => !m.mine && m.wid === wid && Date.now() - m.at <= UNDO_MS + 5000,
          REMOVED,
        ),
      onReact: (wid, emoji) =>
        updateMessage((m) => m.wid === wid, { theirReact: emoji || undefined }),
      onPins: (ids) => setPinned(ids),
      onControl: (ctrl) => handleControl(ctrl),
      onRemoteStream: (stream) => setRemoteStream(stream),
      onConnectionState: (state) => {
        if (state === "failed") {
          teardown("Connection failed (network).");
        }
      },
      onChannelOpen: () => {
        setConn({ kind: "connected", peerId });
      },
    });
    peerRef.current = ps;
  }

  function handleControl(ctrl: PeerControl) {
    const ps = peerRef.current;
    switch (ctrl) {
      case "video-request":
        if (videoRef.current === "none") setVideo("incoming");
        break;
      case "video-accept":
        if (videoRef.current === "requesting" && ps) {
          ps.startVideo()
            .then((stream) => {
              setLocalStream(stream);
              setVideo("active");
            })
            .catch(() => {
              setVideo("none");
              ps.sendControl("video-end");
              showNotice("Camera unavailable.");
            });
        }
        break;
      case "video-decline":
        if (videoRef.current === "requesting") {
          setVideo("none");
          showNotice("Video declined.");
        }
        break;
      // The peer only reports their own choice; it never unblurs anything here.
      case "video-reveal":
        setPrivacy({ ...privacyRef.current, theyShow: true });
        break;
      case "video-blur":
        setPrivacy({ ...privacyRef.current, theyShow: false });
        break;
      case "video-end":
        ps?.stopVideo();
        setLocalStream(null);
        setRemoteStream(null);
        setVideo("none");
        break;
    }
  }

  function requestConnection(peerId: string) {
    if (connRef.current.kind !== "idle") return;
    setConn({ kind: "requesting", peerId });
    void sendSignal(secret, peerId, "request").then((r) => {
      const c = connRef.current;
      if (r.autoDeclined && c.kind === "requesting" && c.peerId === peerId) {
        teardown("They're busy right now. Try someone else.");
      }
    });
    requestTimer.current = setTimeout(() => {
      if (
        connRef.current.kind === "requesting" &&
        connRef.current.peerId === peerId
      ) {
        void sendSignal(secret, peerId, "end");
        teardown("No answer.");
      }
    }, REQUEST_TIMEOUT_MS);
  }

  // "Find someone": preview a random free match within the current vibe
  // filter; the user then says hello or skips to the next one.
  function findSomeone() {
    const free = peers.filter(
      (p) =>
        !p.busy &&
        (!filter || p.vibe === filter) &&
        (!countryFilter || p.country === countryFilter),
    );
    let pool = free.filter((p) => !skipped.current.has(p.id));
    if (pool.length === 0) {
      skipped.current.clear(); // seen everyone: start the round again
      pool = free;
    }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (!pick) return setFound(null);
    setFocus({ lat: pick.lat, lng: pick.lng });
    setFound(pick.id);
  }

  function skipFound() {
    if (found) skipped.current.add(found);
    findSomeone();
  }

  function callFound() {
    if (!found) return;
    const id = found;
    setFound(null);
    requestConnection(id);
  }

  function cancelRequest() {
    if (connRef.current.kind === "requesting") {
      void sendSignal(secret, connRef.current.peerId, "end");
    }
    teardown();
  }

  function acceptIncoming() {
    if (connRef.current.kind !== "incoming") return;
    const peerId = connRef.current.peerId;
    startPeer(peerId, false);
    void sendSignal(secret, peerId, "accept");
    setConn({ kind: "connecting", peerId });
  }

  function declineIncoming() {
    if (connRef.current.kind !== "incoming") return;
    void sendSignal(secret, connRef.current.peerId, "decline");
    setConn({ kind: "idle" });
  }

  function endConnection() {
    const c = connRef.current;
    if (c.kind === "connecting" || c.kind === "connected") {
      void sendSignal(secret, c.peerId, "end");
    }
    teardown();
  }

  function startVideoRequest() {
    if (videoRef.current !== "none" || !peerRef.current) return;
    setVideo("requesting");
    peerRef.current.sendControl("video-request");
  }

  function acceptVideo() {
    const ps = peerRef.current;
    if (!ps) return;
    ps.startVideo()
      .then((stream) => {
        setLocalStream(stream);
        ps.sendControl("video-accept");
        setVideo("active");
      })
      .catch(() => {
        ps.sendControl("video-decline");
        setVideo("none");
        showNotice("Camera unavailable.");
      });
  }

  function declineVideo() {
    peerRef.current?.sendControl("video-decline");
    setVideo("none");
  }

  function endVideo() {
    const ps = peerRef.current;
    ps?.stopVideo();
    ps?.sendControl("video-end");
    setLocalStream(null);
    setRemoteStream(null);
    setVideo("none");
  }

  function toggleShowMe() {
    const showMe = !privacyRef.current.showMe;
    peerRef.current?.sendControl(showMe ? "video-reveal" : "video-blur");
    setPrivacy({ ...privacyRef.current, showMe });
  }


  function processSignal(sig: SignalMsg) {
    switch (sig.type) {
      case "request": {
        if (connRef.current.kind === "idle") {
          setConn({ kind: "incoming", peerId: sig.fromId });
        } else {
          void sendSignal(secret, sig.fromId, "decline");
        }
        break;
      }
      case "accept": {
        const c = connRef.current;
        if (c.kind === "requesting" && c.peerId === sig.fromId) {
          if (requestTimer.current) clearTimeout(requestTimer.current);
          startPeer(sig.fromId, true);
          setConn({ kind: "connecting", peerId: sig.fromId });
        }
        break;
      }
      case "decline": {
        const c = connRef.current;
        if (c.kind === "requesting" && c.peerId === sig.fromId) {
          if (requestTimer.current) clearTimeout(requestTimer.current);
          teardown("Request declined.");
        }
        break;
      }
      case "offer":
      case "answer":
      case "ice": {
        const c = connRef.current;
        const peerId =
          c.kind === "connecting" || c.kind === "connected" ? c.peerId : null;
        if (peerRef.current && peerId === sig.fromId) {
          void peerRef.current.handleSignal(
            sig.type as DescType,
            sig.payload ?? "",
          );
        }
        break;
      }
      case "end": {
        const c = connRef.current;
        if (
          (c.kind === "incoming" ||
            c.kind === "connecting" ||
            c.kind === "connected") &&
          c.peerId === sig.fromId
        ) {
          if (c.kind === "incoming") setConn({ kind: "idle" });
          else teardown("Stranger disconnected.");
        }
        break;
      }
    }
  }

  const processSignalRef = useRef(processSignal);
  useEffect(() => {
    processSignalRef.current = processSignal;
  });

  useEffect(() => {
    if (phase !== "live" || !secret) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const data = await poll(secret, profileRef.current.seeking, myCountry.current);
        if (!active) return;
        if (!data) {
          if (myLocationRef.current) {
            const { lat, lng } = myLocationRef.current;
            await join(secret, lat, lng, profileRef.current, true);
          }
        } else {
          setPeers(data.peers);
          for (const s of data.signals) processSignalRef.current(s);
        }
      } catch {}
      if (active) timer = setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [phase, secret]);

  useEffect(() => {
    if (phase === "live") return;
    let active = true;
    const load = () =>
      fetch("/api/glance", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((g: Glance | null) => active && g && setGlance(g))
        .catch(() => {});
    void load();
    const id = setInterval(load, 8000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [phase]);

  useEffect(() => {
    if (!secret || phase !== "live") return;
    // Leave only when the page really goes away (pagehide). Sending it on
    // beforeunload would hang up even if the user cancels the warning below.
    const onLeave = () => leave(secret);
    // Mid-conversation, a refresh or close would disconnect the match, so
    // ask first. Browsers show their own wording; custom text isn't allowed.
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (connRef.current.kind === "idle") return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [secret, phase]);

  async function handleReady(lat: number, lng: number, profile: Profile) {
    profileRef.current = profile;
    setMyVibe(profile.vibe as VibeId);
    setSeeking(profile.seeking);
    // Show the user the offset position others see, not their exact spot.
    const placed = await join(secret, lat, lng, profile);
    myLocationRef.current = placed;
    setMyLocation(placed);
    // Looked up from the offset dot, so the raw location never reaches Mapbox.
    void countryCode(placed).then((c) => (myCountry.current = c));
    setPhase("live");
  }

  // Ring while someone is asking for us: a chat request or a video call.
  const ringing = conn.kind === "incoming" || video === "incoming";
  useEffect(() => (ringing ? startRing() : undefined), [ringing]);

  const livePeerId = conn.kind === "idle" ? found : conn.peerId;
  const livePeer = peers.find((p) => p.id === livePeerId);
  useEffect(() => {
    if (!livePeer) return;
    let cancelled = false;
    void placeName(livePeer).then((name) => {
      if (!cancelled && name) setPlace({ peerId: livePeer.id, name });
    });
    return () => {
      cancelled = true;
    };
    // Positions are fixed per session, so the id is the only real input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePeer?.id]);
  const where = [
    livePeer && myLocation ? formatDistance(distanceKm(myLocation, livePeer)) : null,
    place?.peerId === livePeerId ? place?.name : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const live = phase === "live";
  const inChat = conn.kind === "connecting" || conn.kind === "connected";
  const peerId = conn.kind === "idle" ? null : conn.peerId;
  const peerVibe = vibeOf(peers.find((p) => p.id === peerId)?.vibe);
  const color = peerVibe.color;
  const shown = peers.filter(
    (p) => (!filter || p.vibe === filter) && (!countryFilter || p.country === countryFilter),
  );
  const available = shown.filter((p) => !p.busy).length;

  return (
    <main className="fixed inset-0 overflow-hidden bg-bg">
      <WorldMap
        peers={shown}
        me={myLocation}
        myVibe={myVibe}
        onPeerClick={requestConnection}
        canConnect={conn.kind === "idle"}
        focus={focus}
        preview={live ? undefined : glance?.spots}
      />

      {!live && <EntryGate onReady={handleReady} counts={glance?.counts} />}

      {live && (
        <header className={`anim-fade pointer-events-none absolute inset-x-0 top-0 z-20 ${inChat ? "md:right-[420px]" : ""} flex items-start justify-between gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))]`}>
          <div className="glass pointer-events-auto flex items-center gap-2 rounded-full py-2 pl-3 pr-4">
            <span className="relative grid size-2.5 place-items-center">
              <span className="absolute size-full animate-ping rounded-full bg-accent opacity-60" />
              <span className="size-2.5 rounded-full bg-accent" />
            </span>
            <span className="text-sm font-semibold tracking-tight">Pulse</span>
          </div>
          <div
            className="glass pointer-events-auto rounded-full px-4 py-2 text-sm"
            aria-live="polite"
          >
            <span className="font-semibold tabular-nums text-ink">
              {peers.length}
            </span>{" "}
            <span className="text-ink-dim">
              {peers.length === 1 ? "other person" : "other people"} online
            </span>
          </div>
        </header>
      )}

      {live && !inChat && (
        <ThemePicker className="glass anim-fade absolute bottom-40 left-4 z-10 flex-col rounded-full p-1 md:bottom-24" />
      )}

      {live && !inChat && (
        <VibeFilter
          peers={peers}
          value={filter}
          onChange={setFilter}
          country={countryFilter}
          onCountry={setCountryFilter}
        />
      )}

      {live && conn.kind === "idle" && !found && (
        <div className="anim-rise absolute bottom-[calc(max(1.5rem,env(safe-area-inset-bottom))+3.25rem)] left-1/2 z-10 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2">
          {available > 0 && (
            <button
              onClick={findSomeone}
              className="btn-primary flex h-11 items-center gap-2 whitespace-nowrap rounded-full px-5 text-sm"
            >
              <span aria-hidden="true">{filter ? vibeOf(filter).emoji : "🎲"}</span>
              {filter ? `Find someone into ${vibeOf(filter).label.toLowerCase()}` : "Find someone"}
            </button>
          )}
          <div
            role="radiogroup"
            aria-label="Looking for"
            className="glass flex h-11 items-center gap-1 rounded-full p-1 text-sm"
          >
            <span className="hidden pl-3 pr-1 text-xs text-ink-faint sm:inline">Looking for</span>
            {SEEKING.map((o) => (
              <button
                key={o.id}
                role="radio"
                aria-checked={seeking === o.id}
                onClick={() => setSeeking(o.id)}
                className={`h-9 rounded-full px-3.5 transition ${
                  seeking === o.id ? "bg-white text-black" : "text-ink-dim hover:text-ink"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {live && conn.kind === "idle" && found && livePeer && (
        <div
          role="dialog"
          aria-label="Found someone"
          className="glass-strong anim-rise absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 z-30 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-3xl p-5"
        >
          <div className="flex items-center gap-4">
            <span
              className="grid size-12 shrink-0 place-items-center rounded-full text-2xl"
              style={{
                background: `color-mix(in srgb, ${vibeOf(livePeer.vibe).color} 22%, transparent)`,
                boxShadow: `0 0 0 1px ${vibeOf(livePeer.vibe).color}, 0 0 24px -6px ${vibeOf(livePeer.vibe).color}`,
              }}
              aria-hidden="true"
            >
              {vibeOf(livePeer.vibe).emoji}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Found someone</p>
              <p className="text-sm text-ink-dim">
                Feeling {vibeOf(livePeer.vibe).label.toLowerCase()}
                {livePeer.vibe === myVibe ? ", same as you" : ""}
              </p>
              {where && <p className="mt-0.5 line-clamp-2 text-xs text-ink-faint">{where}</p>}
            </div>
            <button
              onClick={() => setFound(null)}
              aria-label="Close"
              className="btn-ghost grid size-9 shrink-0 place-items-center self-start rounded-full"
            >
              <CloseIcon width={16} height={16} />
            </button>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={skipFound} className="btn-ghost h-12 flex-1 rounded-full text-sm font-medium">
              Skip
            </button>
            <button onClick={callFound} className="btn-primary h-12 flex-1 rounded-full text-sm">
              Say hello
            </button>
          </div>
        </div>
      )}

      {live && conn.kind === "idle" && !found && (
        <p className="glass anim-rise pointer-events-none absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 z-10 w-max max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-full px-4 py-2.5 text-center text-sm text-ink-dim">
          {shown.length === 0
            ? filter
              ? `Nobody's feeling ${vibeOf(filter).emoji} right now. Try another vibe.`
              : "It's quiet right now. Your dot is live, so someone may find you."
            : available === 0
              ? "Everyone's mid-conversation. Hang tight."
              : "Or tap any glowing dot to say hello"}
        </p>
      )}

      {notice && (
        <div
          key={notice.id}
          role="status"
          className="glass-strong anim-drop absolute left-1/2 top-20 z-[60] -translate-x-1/2 rounded-full px-5 py-2.5 text-sm font-medium"
        >
          {notice.text}
        </div>
      )}

      {conn.kind === "requesting" && (
        <div className="glass-strong anim-rise absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 z-30 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 overflow-hidden rounded-3xl">
          <div className="flex items-center gap-4 p-4">
            <span
              className="radar relative grid size-11 shrink-0 place-items-center rounded-full"
              style={{ ["--accent" as string]: color }}
            >
              <span
                className="size-4 rounded-full"
                style={{ background: color, boxShadow: `0 0 16px ${color}` }}
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                Calling a stranger {peerVibe.emoji}
              </p>
              <p className="line-clamp-2 text-xs text-ink-dim">
                {where || "Waiting for them to accept"}
              </p>
            </div>
            <button
              onClick={cancelRequest}
              className="btn-ghost h-10 rounded-full px-4 text-sm"
            >
              Cancel
            </button>
          </div>
          <div
            className="h-1 origin-left"
            style={{
              background: color,
              animation: `countdown ${REQUEST_TIMEOUT_MS}ms linear forwards`,
            }}
          />
        </div>
      )}

      {conn.kind === "incoming" && (
        <ConnectionPrompt
          title="Someone wants to talk"
          subtitle={`A stranger feeling ${peerVibe.emoji} ${peerVibe.label.toLowerCase()} tapped your dot${where ? `, ${where}` : ""}. Nothing is shared until you accept.`}
          acceptLabel="Accept"
          declineLabel="Not now"
          color={color}
          icon={<span className="text-2xl">{peerVibe.emoji}</span>}
          onAccept={acceptIncoming}
          onDecline={declineIncoming}
        />
      )}

      {inChat && (
        <ChatPanel
          messages={messages}
          connected={conn.kind === "connected"}
          videoBusy={video !== "none"}
          color={color}
          vibe={peerVibe}
          where={where}
          icebreaker={peerId ? icebreaker(peerVibe.id, peerId, promptTurn) : ""}
          onShuffle={() => setPromptTurn((t) => t + 1)}
          onSendPhoto={sendPhoto}
          onSendVoice={sendVoice}
          onUnsend={unsendMessage}
          onReact={reactMessage}
          pinned={pinned
            .map((w) => messages.find((m) => m.wid === w && !m.unsent))
            .filter((m): m is ChatMessage => !!m)}
          onPins={setPins}
          onSend={(text, replyTo) => {
            const wid = newMsgId();
            peerRef.current?.sendChat(text, wid, replyTo);
            addMessage(true, text, wid, { replyTo });
          }}
          onStartVideo={startVideoRequest}
          onEnd={() => setConfirmLeave(true)}
          overVideo={video === "active" && chatOverVideo}
          onHide={
            video === "active"
              ? () => setChatOverVideo(false)
              : undefined
          }
        />
      )}

      {video === "requesting" && (
        <div className="glass-strong anim-drop absolute left-1/2 top-20 z-[35] flex -translate-x-1/2 items-center gap-2.5 rounded-full px-5 py-2.5 text-sm md:left-[calc(50%-210px)]">
          <span className="size-2 animate-pulse rounded-full bg-accent" />
          Asking to start video…
        </div>
      )}

      {video === "incoming" && (
        <ConnectionPrompt
          title="Your match wants to video call"
          subtitle="If you accept, you'll both start blurred. Nobody sees you clearly until you choose to show yourself."
          acceptLabel="Accept"
          declineLabel="Decline"
          color={color}
          icon={<VideoIcon width={26} height={26} />}
          onAccept={acceptVideo}
          onDecline={declineVideo}
        />
      )}

      {confirmLeave && inChat && (
        <ConnectionPrompt
          title="Leave this chat?"
          subtitle="You'll be disconnected from your match, and the conversation disappears for both of you. It can't be recovered."
          acceptLabel="Leave"
          declineLabel="Stay"
          color="var(--danger)"
          danger
          icon={<PhoneOffIcon width={24} height={24} />}
          onAccept={() => {
            setConfirmLeave(false);
            endConnection();
          }}
          onDecline={() => setConfirmLeave(false)}
        />
      )}

      {video === "active" && (
        <VideoPanel
          localStream={localStream}
          remoteStream={remoteStream}
          privacy={privacy}
          onToggleShowMe={toggleShowMe}
          onEnd={endVideo}
          onOpenChat={() => {
            setChatOverVideo(true);
            setUnread(false);
          }}
          unread={!chatOverVideo && unread}
        />
      )}
    </main>
  );
}
