import { blurredCamera, type BlurredCamera } from "./blur";
import { isJpeg, MAX_PHOTO_BYTES } from "./image";
import { audioType, MAX_VOICE_BYTES, MAX_VOICE_SECONDS } from "./voice";

export type DescType = "offer" | "answer" | "ice";
export type PeerControl =
  | "video-request"
  | "video-accept"
  | "video-decline"
  | "video-end"
  | "video-reveal" // I'm ready to be seen clearly
  | "video-blur"; // blur me again

interface PeerCallbacks {
  onSignal: (type: DescType, payload: string) => void;
  onChat: (text: string, id: string, replyTo?: string) => void;
  onPhoto?: (photo: Blob, id: string) => void;
  onVoice?: (voice: Blob, seconds: number, id: string) => void;
  onUnsend?: (id: string) => void;
  onReact?: (id: string, emoji: string) => void;
  onPins?: (ids: string[]) => void;
  onControl: (ctrl: PeerControl) => void;
  onRemoteStream: (stream: MediaStream | null) => void;
  onConnectionState: (state: RTCPeerConnectionState) => void;
  onChannelOpen: () => void;
}

const CONTROLS: readonly string[] = [
  "video-request",
  "video-accept",
  "video-decline",
  "video-end",
  "video-reveal",
  "video-blur",
];

// The peer is an untrusted stranger: cap what they can push at us.
export const MAX_CHAT_LEN = 1000;

// Messages carry a short random id so either side can refer to one later
// (undo send, heart react). Undo is only honoured within UNDO_MS.
export const UNDO_MS = 30_000;
export const MAX_PINS = 5;
const isMsgId = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9]{6,16}$/.test(v);
// The only reactions accepted, so a peer can't push arbitrary text.
export const REACTIONS = ["❤️", "😆", "😮", "😢", "😡", "👍"] as const;
export const newMsgId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12);

// Photos and voice notes travel as: {t:"file-start", kind, size} -> binary
// chunks -> {t:"file-end"}. The channel is reliable + ordered, so one
// transfer at a time is enough (and enforced on the sending side).
export type FileKind = "photo" | "voice";
const MAX_BYTES: Record<FileKind, number> = {
  photo: MAX_PHOTO_BYTES,
  voice: MAX_VOICE_BYTES,
};
// Total media a stranger can push at us in one chat; beyond it, ignored.
// Everything received lives in memory until the chat ends.
const MAX_MEDIA_PER_CHAT = 50 * 1024 * 1024;
const CHUNK = 16 * 1024;
const HIGH_WATER = 1024 * 1024;

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export class PeerSession {
  private pc: RTCPeerConnection;
  private dc: RTCDataChannel | null = null;
  private readonly polite: boolean;
  private makingOffer = false;
  private ignoreOffer = false;
  private camera: BlurredCamera | null = null;
  // Outgoing video stays blurred until this user chooses to show themselves.
  private clear = false;
  private closed = false;
  private readonly cb: PeerCallbacks;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private incoming: {
    kind: FileKind;
    id: string;
    size: number;
    seconds: number;
    got: number;
    parts: ArrayBuffer[];
  } | null = null;
  private received = 0;
  private sending = false;

  constructor(initiator: boolean, cb: PeerCallbacks) {
    this.cb = cb;
    this.polite = !initiator;
    this.pc = new RTCPeerConnection(ICE_CONFIG);

    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.cb.onSignal("ice", JSON.stringify(candidate));
      }
    };

    this.pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true;
        await this.pc.setLocalDescription();
        if (this.pc.localDescription) {
          this.cb.onSignal("offer", JSON.stringify(this.pc.localDescription));
        }
      } finally {
        this.makingOffer = false;
      }
    };

    this.pc.ontrack = ({ streams }) => {
      this.cb.onRemoteStream(streams[0] ?? null);
    };

    this.pc.onconnectionstatechange = () => {
      this.cb.onConnectionState(this.pc.connectionState);
    };

    if (initiator) {
      this.dc = this.pc.createDataChannel("chat");
      this.wireDataChannel(this.dc);
    } else {
      this.pc.ondatachannel = (e) => {
        this.dc = e.channel;
        this.wireDataChannel(this.dc);
      };
    }
  }

  private wireDataChannel(dc: RTCDataChannel) {
    dc.binaryType = "arraybuffer";
    dc.onopen = () => this.cb.onChannelOpen();
    dc.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) return this.onFileChunk(e.data);
      if (typeof e.data !== "string" || e.data.length > MAX_CHAT_LEN * 8) return;
      try {
        const msg = JSON.parse(e.data);
        if (msg.t === "chat" && typeof msg.text === "string" && isMsgId(msg.id)) {
          const text = msg.text.trim().slice(0, MAX_CHAT_LEN);
          if (text) this.cb.onChat(text, msg.id, isMsgId(msg.replyTo) ? msg.replyTo : undefined);
        } else if (msg.t === "unsend" && isMsgId(msg.id)) {
          this.cb.onUnsend?.(msg.id);
        } else if (msg.t === "react" && isMsgId(msg.id)) {
          const emoji = (REACTIONS as readonly string[]).includes(msg.emoji) ? msg.emoji : "";
          this.cb.onReact?.(msg.id, emoji);
        } else if (
          msg.t === "pins" &&
          Array.isArray(msg.ids) &&
          msg.ids.length <= MAX_PINS &&
          msg.ids.every(isMsgId)
        ) {
          this.cb.onPins?.(msg.ids);
        } else if (msg.t === "ctrl" && CONTROLS.includes(msg.ctrl)) {
          this.cb.onControl(msg.ctrl as PeerControl);
        } else if (msg.t === "file-start") {
          const kind: FileKind | null =
            msg.kind === "photo" || msg.kind === "voice" ? msg.kind : null;
          const ok =
            kind &&
            isMsgId(msg.id) &&
            Number.isInteger(msg.size) &&
            msg.size > 0 &&
            msg.size <= MAX_BYTES[kind] &&
            this.received + msg.size <= MAX_MEDIA_PER_CHAT;
          // Display-only, so just clamp whatever the peer claims.
          const seconds = Math.min(
            MAX_VOICE_SECONDS,
            Math.max(1, Math.round(Number(msg.seconds) || 1)),
          );
          this.incoming = ok
            ? { kind, id: msg.id, size: msg.size, seconds, got: 0, parts: [] }
            : null;
        } else if (msg.t === "file-end") {
          this.finishFile();
        }
      } catch {}
    };
  }

  async handleSignal(type: DescType, payload: string) {
    if (this.closed) return;
    let data;
    try {
      data = JSON.parse(payload);
    } catch {
      return; // malformed signaling payload
    }

    if (type === "ice") {
      if (!this.pc.remoteDescription) {
        this.pendingCandidates.push(data);
        return;
      }
      try {
        await this.pc.addIceCandidate(data);
      } catch {}
      return;
    }

    const desc = data as RTCSessionDescriptionInit;
    const offerCollision =
      desc.type === "offer" &&
      (this.makingOffer || this.pc.signalingState !== "stable");
    this.ignoreOffer = !this.polite && offerCollision;
    if (this.ignoreOffer) return;

    await this.pc.setRemoteDescription(desc);
    // Candidates can only be added once a remote description exists.
    await this.flushPendingCandidates();
    if (desc.type === "offer") {
      await this.pc.setLocalDescription();
      if (this.pc.localDescription) {
        this.cb.onSignal("answer", JSON.stringify(this.pc.localDescription));
      }
    }
  }

  private async flushPendingCandidates() {
    if (this.pendingCandidates.length === 0) return;
    const queued = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const candidate of queued) {
      try {
        await this.pc.addIceCandidate(candidate);
      } catch {}
    }
  }

  sendChat(text: string, id: string, replyTo?: string) {
    this.safeSend({ t: "chat", text, id, replyTo });
  }

  // The whole pinned list, so both sides always agree on it.
  sendPins(ids: string[]) {
    this.safeSend({ t: "pins", ids });
  }

  sendUnsend(id: string) {
    this.safeSend({ t: "unsend", id });
  }

  sendReact(id: string, emoji: string) {
    this.safeSend({ t: "react", id, emoji });
  }

  // The peer is untrusted: drop anything over the declared (capped) size.
  private onFileChunk(chunk: ArrayBuffer) {
    const p = this.incoming;
    if (!p) return;
    p.got += chunk.byteLength;
    if (p.got > p.size) {
      this.incoming = null;
      return;
    }
    p.parts.push(chunk);
  }

  private finishFile() {
    const p = this.incoming;
    this.incoming = null;
    if (!p || p.got !== p.size) return;
    this.received += p.size;
    const head = new Uint8Array(p.parts[0] ?? new ArrayBuffer(0));
    if (p.kind === "photo") {
      if (isJpeg(head)) this.cb.onPhoto?.(new Blob(p.parts, { type: "image/jpeg" }), p.id);
    } else {
      const type = audioType(head);
      if (type) this.cb.onVoice?.(new Blob(p.parts, { type }), p.seconds, p.id);
    }
  }

  async sendFile(kind: FileKind, file: Blob, id: string, seconds = 0): Promise<void> {
    const dc = this.dc;
    if (!dc || dc.readyState !== "open") throw new Error("Not connected.");
    if (this.sending) throw new Error("Wait for the last one to finish sending.");
    this.sending = true;
    try {
      const bytes = await file.arrayBuffer();
      dc.send(JSON.stringify({ t: "file-start", kind, id, size: bytes.byteLength, seconds }));
      dc.bufferedAmountLowThreshold = HIGH_WATER / 2;
      for (let i = 0; i < bytes.byteLength; i += CHUNK) {
        if (dc.bufferedAmount > HIGH_WATER) {
          await new Promise((r) =>
            dc.addEventListener("bufferedamountlow", r, { once: true }),
          );
        }
        if (dc.readyState !== "open") throw new Error("Connection closed.");
        dc.send(bytes.slice(i, i + CHUNK));
      }
      dc.send(JSON.stringify({ t: "file-end" }));
    } finally {
      this.sending = false;
    }
  }

  sendControl(ctrl: PeerControl) {
    this.safeSend({ t: "ctrl", ctrl });
  }

  private safeSend(obj: unknown) {
    if (this.dc && this.dc.readyState === "open") {
      this.dc.send(JSON.stringify(obj));
    }
  }

  // Returns the stream actually being sent (blurred until we choose to show).
  async startVideo(): Promise<MediaStream> {
    if (!this.camera) {
      const raw = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      this.clear = false;
      this.camera = blurredCamera(raw, () => this.clear);
      const { stream } = this.camera;
      for (const track of stream.getTracks()) this.pc.addTrack(track, stream);
    }
    return this.camera.stream;
  }

  setVideoClear(clear: boolean) {
    this.clear = clear;
  }

  stopVideo() {
    if (this.camera) {
      this.camera.stop();
      this.clear = false;
      for (const sender of this.pc.getSenders()) {
        if (sender.track) {
          try {
            this.pc.removeTrack(sender);
          } catch {}
        }
      }
      this.camera = null;
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.stopVideo();
    if (this.dc) {
      try {
        this.dc.close();
      } catch {}
    }
    try {
      this.pc.close();
    } catch {}
  }
}
