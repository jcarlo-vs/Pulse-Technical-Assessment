// Consent-blur: the camera is blurred *before* it leaves this device.
//
// Each frame of the raw camera is drawn through a canvas. While blurred, the
// frame is squeezed to 16px wide and stretched back up, which leaves a soft
// silhouette (works in every browser; ctx.filter isn't reliable in Safari).
// The peer only ever receives the canvas stream, so a modified client on the
// other end still can't see you clearly until you choose to reveal.

const FPS = 24;
const BLUR_WIDTH = 16;

export interface BlurredCamera {
  stream: MediaStream; // what gets sent (and shown as your self-view)
  stop: () => void;
}

export function blurredCamera(
  raw: MediaStream,
  isClear: () => boolean,
): BlurredCamera {
  const source = document.createElement("video");
  source.muted = true;
  source.playsInline = true;
  source.srcObject = raw;
  void source.play().catch(() => {});

  // The canvas follows the *actual* frame size (source.videoWidth/Height),
  // not the track settings: phones report the sensor's landscape size while
  // delivering portrait frames, which squashed the picture. Re-checked every
  // frame, so rotating the phone mid-call stays natural too.
  const settings = raw.getVideoTracks()[0]?.getSettings() ?? {};
  const out = document.createElement("canvas");
  out.width = settings.width ?? 640;
  out.height = settings.height ?? 480;
  const ctx = out.getContext("2d")!;

  const tiny = document.createElement("canvas");
  const tctx = tiny.getContext("2d")!;
  const fit = (w: number, h: number) => {
    if (out.width !== w || out.height !== h) {
      out.width = w;
      out.height = h;
    }
    tiny.width = BLUR_WIDTH;
    tiny.height = Math.max(1, Math.round((BLUR_WIDTH * h) / w));
  };
  fit(out.width, out.height);

  // ponytail: setInterval is throttled to ~1fps in background tabs; fine for a
  // call you're looking at. Upgrade to requestVideoFrameCallback if needed.
  const timer = setInterval(() => {
    if (source.readyState < 2) return;
    const w = source.videoWidth || out.width;
    const h = source.videoHeight || out.height;
    if (w !== out.width || h !== out.height) fit(w, h);
    if (isClear()) {
      ctx.drawImage(source, 0, 0, w, h);
    } else {
      tctx.drawImage(source, 0, 0, tiny.width, tiny.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(tiny, 0, 0, w, h);
    }
  }, 1000 / FPS);

  const stream = new MediaStream([
    ...out.captureStream(FPS).getVideoTracks(),
    ...raw.getAudioTracks(),
  ]);

  return {
    stream,
    stop() {
      clearInterval(timer);
      raw.getTracks().forEach((t) => t.stop());
      stream.getTracks().forEach((t) => t.stop());
      source.srcObject = null;
    },
  };
}
