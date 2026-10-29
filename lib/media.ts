// Turn a failed camera/mic request into something a person can act on.
// Browsers often refuse instantly, with no prompt (blocked earlier, opened
// inside an app's built-in browser, camera busy), so "Camera unavailable"
// alone leaves people stuck.

export interface MediaHelp {
  title: string;
  steps: string[];
}

export function explainMediaError(err: unknown): MediaHelp {
  const ua = navigator.userAgent;
  const name = err instanceof DOMException ? err.name : "";
  const inApp = /FBAN|FBAV|FB_IAB|Instagram|Messenger|Line\/|TikTok|musical_ly|Snapchat|Twitter/i.test(ua);
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);

  if (inApp || !navigator.mediaDevices?.getUserMedia) {
    return {
      title: "Open Pulse in your browser for video",
      steps: [
        "Built-in browsers inside apps like Messenger, Instagram or TikTok can't use the camera.",
        "Tap ⋯ (or the share icon) and choose Open in Safari or Open in Chrome.",
        "Join again there and start the video call.",
      ],
    };
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return {
      title: "Your camera is busy",
      steps: [
        "Another app (FaceTime, Zoom, Teams…) or another tab is using the camera.",
        "Close it, then start the video call again.",
      ],
    };
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return {
      title: "No camera or microphone found",
      steps: ["Connect a camera and microphone, then try again. You can keep chatting by text meanwhile."],
    };
  }

  if (name !== "NotAllowedError" && name !== "SecurityError") {
    return {
      title: "Couldn't start the camera",
      steps: [
        "Close other apps or tabs that might be using the camera.",
        "Reload Pulse and start the video call again.",
        "Still failing? Try the latest Safari or Chrome.",
      ],
    };
  }

  // NotAllowedError / SecurityError: blocked, now or earlier.
  const iosApp = /CriOS/.test(ua) ? "Chrome" : /FxiOS/.test(ua) ? "Firefox" : /EdgiOS/.test(ua) ? "Edge" : null;
  return {
    title: "Camera and mic are blocked for Pulse",
    steps: ios
      ? iosApp
        ? [
            `Open the iPhone Settings app, scroll down and tap ${iosApp}.`,
            "Turn on Camera and Microphone.",
            "Come back, reload Pulse and start the video call again.",
          ]
        : [
            "In Safari, tap aA next to the web address › Website Settings.",
            "Set Camera and Microphone to Allow (or Ask).",
            "Reload Pulse and start the video call again.",
          ]
      : /Android/.test(ua)
        ? [
            "Tap the icon to the left of the web address (🔒 or ⓘ) › Permissions.",
            "Allow Camera and Microphone.",
            "Reload Pulse and start the video call again.",
          ]
        : [
            "Click the icon to the left of the address bar.",
            "Allow Camera and Microphone for this site.",
            "Reload Pulse and start the video call again.",
          ],
  };
}
