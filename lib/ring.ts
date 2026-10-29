// A soft "beep-beep" ring, synthesised with Web Audio so there's no sound
// file to ship. Returns a stop function.

let ctx: AudioContext | null = null;

export function startRing(): () => void {
  try {
    ctx ??= new AudioContext();
  } catch {
    return () => {};
  }
  const ac = ctx;
  // Allowed: the user has already interacted (joined the globe).
  void ac.resume().catch(() => {});

  const beep = (at: number) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.08, at + 0.02);
    gain.gain.linearRampToValueAtTime(0, at + 0.18);
    osc.connect(gain).connect(ac.destination);
    osc.start(at);
    osc.stop(at + 0.2);
  };
  const ring = () => {
    const t = ac.currentTime;
    beep(t);
    beep(t + 0.28);
  };

  ring();
  const id = setInterval(ring, 2000);
  return () => clearInterval(id);
}
