// Shared types across client + API.

// Signal mailbox message types.
export type SignalType =
  | "request" // connection request (tap a dot)
  | "accept" // recipient accepted
  | "decline" // recipient declined (or auto-declined while busy)
  | "offer" // WebRTC SDP offer
  | "answer" // WebRTC SDP answer
  | "ice" // WebRTC ICE candidate
  | "end"; // hang up / leave the connection

export interface PeerDot {
  id: string;
  lat: number;
  lng: number;
  busy: boolean;
  vibe: string;
  country: string; // ISO alpha-2, "" if unknown
}

export interface SignalMsg {
  id: string;
  fromId: string;
  toId: string;
  type: SignalType;
  payload: string | null;
  createdAt: string;
}

export interface PollResponse {
  peers: PeerDot[];
  signals: SignalMsg[];
}

// Public, coarse snapshot for the entry screen (/api/glance).
export type GlanceStatus = "available" | "call" | "waiting";
export interface Glance {
  counts: { available: number; inCall: number; waiting: number };
  spots: { lat: number; lng: number; s: GlanceStatus }[];
}
