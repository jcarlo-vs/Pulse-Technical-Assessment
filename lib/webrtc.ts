import { blurredCamera, type BlurredCamera } from "./blur";

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
  onChat: (text: string) => void;
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
    dc.onopen = () => this.cb.onChannelOpen();
    dc.onmessage = (e) => {
      if (typeof e.data !== "string" || e.data.length > MAX_CHAT_LEN * 8) return;
      try {
        const msg = JSON.parse(e.data);
        if (msg.t === "chat" && typeof msg.text === "string") {
          const text = msg.text.trim().slice(0, MAX_CHAT_LEN);
          if (text) this.cb.onChat(text);
        } else if (msg.t === "ctrl" && CONTROLS.includes(msg.ctrl)) {
          this.cb.onControl(msg.ctrl as PeerControl);
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

  sendChat(text: string) {
    this.safeSend({ t: "chat", text });
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
