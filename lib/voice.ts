// Voice notes are recorded in the browser and sent peer-to-peer over the
// chat data channel, like photos: never uploaded, only held in memory.

export const MAX_VOICE_SECONDS = 60;
// 60 s of opus at 32 kbps is ~240 KB; the cap leaves room for Safari's AAC.
export const MAX_VOICE_BYTES = 1024 * 1024;

const TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"];

export interface Recording {
  // Resolves with the note, or null if it was cancelled / came out empty.
  stop: (keep: boolean) => Promise<Blob | null>;
}

export async function startRecording(): Promise<Recording> {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("Voice notes aren't supported in this browser.");
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    throw new Error("Microphone access is needed for voice notes.");
  }
  const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
  const rec = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 });
  const parts: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) parts.push(e.data);
  };
  const done = new Promise<Blob>((resolve) => {
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      resolve(new Blob(parts, { type: rec.mimeType }));
    };
  });
  rec.start();

  return {
    async stop(keep) {
      if (rec.state !== "inactive") rec.stop();
      const blob = await done;
      return keep && blob.size > 0 && blob.size <= MAX_VOICE_BYTES ? blob : null;
    },
  };
}

// Received bytes are only played if they really are audio, sniffed from the
// first bytes rather than trusting anything the peer claims.
export function audioType(b: Uint8Array): string | null {
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "audio/webm";
  if (b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) return "audio/ogg";
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return "audio/mp4";
  return null;
}
