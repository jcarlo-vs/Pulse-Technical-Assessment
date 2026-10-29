"use client";

import { useEffect, useRef, useState } from "react";
import EntryGate from "./components/EntryGate";
import WorldMap, { peerColor } from "./components/WorldMap";
import { VideoIcon } from "./components/icons";
import ConnectionPrompt from "./components/ConnectionPrompt";
import ChatPanel, { type ChatMessage } from "./components/ChatPanel";
import VideoPanel from "./components/VideoPanel";
import { join, leave, newSecret, poll, sendSignal } from "@/lib/api";
import { PeerSession, type DescType, type PeerControl } from "@/lib/webrtc";
import { POLL_INTERVAL_MS } from "@/lib/presence";
import { type PeerDot, type SignalMsg } from "@/lib/types";

type Conn =
  | { kind: "idle" }
  | { kind: "requesting"; peerId: string }
  | { kind: "incoming"; peerId: string }
  | { kind: "connecting"; peerId: string }
  | { kind: "connected"; peerId: string };

type VideoState = "none" | "requesting" | "incoming" | "active";

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
  };

  // Our *offset* position, re-sent as-is if we get reaped and must re-join.
  // (The raw location is never kept after the first join.)
  const myLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const peerRef = useRef<PeerSession | null>(null);
  const msgId = useRef(0);
  const requestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showNotice(text: string) {
    const id = Date.now();
    setNotice({ id, text });
    window.setTimeout(
      () => setNotice((n) => (n?.id === id ? null : n)),
      3500,
    );
  }

  function addMessage(mine: boolean, text: string) {
    setMessages((prev) => [...prev, { id: msgId.current++, mine, text }]);
  }

  function teardown(message?: string) {
    if (requestTimer.current) clearTimeout(requestTimer.current);
    peerRef.current?.close();
    peerRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setVideo("none");
    setMessages([]);
    setConn({ kind: "idle" });
    if (message) showNotice(message);
  }

  function startPeer(peerId: string, initiator: boolean) {
    const ps = new PeerSession(initiator, {
      onSignal: (type: DescType, payload: string) => {
        void sendSignal(secret, peerId, type, payload);
      },
      onChat: (text) => addMessage(false, text),
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
        const data = await poll(secret);
        if (!active) return;
        if (!data) {
          if (myLocationRef.current) {
            const { lat, lng } = myLocationRef.current;
            await join(secret, lat, lng, true);
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
    if (!secret || phase !== "live") return;
    const onLeave = () => leave(secret);
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [secret, phase]);

  async function handleReady(lat: number, lng: number) {
    // Show the user the offset position others see, not their exact spot.
    const placed = await join(secret, lat, lng);
    myLocationRef.current = placed;
    setMyLocation(placed);
    setPhase("live");
  }

  const live = phase === "live";
  const inChat = conn.kind === "connecting" || conn.kind === "connected";
  const peerId = conn.kind === "idle" ? null : conn.peerId;
  const color = peerId ? peerColor(peerId) : "var(--accent)";
  const available = peers.filter((p) => !p.busy).length;

  return (
    <main className="fixed inset-0 overflow-hidden bg-bg">
      <WorldMap
        peers={peers}
        me={myLocation}
        onPeerClick={requestConnection}
        canConnect={conn.kind === "idle"}
      />

      {!live && <EntryGate onReady={handleReady} />}

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

      {live && conn.kind === "idle" && (
        <p className="glass anim-rise pointer-events-none absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 z-10 w-max max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-full px-4 py-2.5 text-center text-sm text-ink-dim">
          {peers.length === 0
            ? "It's quiet right now. Your dot is live, so someone may find you."
            : available === 0
              ? "Everyone's mid-conversation. Hang tight."
              : "Tap a glowing dot to say hello"}
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
              <p className="font-semibold">Calling a stranger…</p>
              <p className="text-xs text-ink-dim">
                Waiting for them to accept
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
          subtitle="A stranger nearby tapped your dot. Nothing is shared until you accept."
          acceptLabel="Accept"
          declineLabel="Not now"
          color={color}
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
          onSend={(text) => {
            peerRef.current?.sendChat(text);
            addMessage(true, text);
          }}
          onStartVideo={startVideoRequest}
          onEnd={endConnection}
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
          title="Start a video call?"
          subtitle="Your camera and mic turn on only if you accept."
          acceptLabel="Turn on camera"
          declineLabel="Stay in chat"
          color={color}
          icon={<VideoIcon width={24} height={24} />}
          onAccept={acceptVideo}
          onDecline={declineVideo}
        />
      )}

      {video === "active" && (
        <VideoPanel
          localStream={localStream}
          remoteStream={remoteStream}
          onEnd={endVideo}
        />
      )}
    </main>
  );
}
