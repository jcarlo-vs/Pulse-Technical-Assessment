"use client";

// Reusable prompt for "someone wants to connect" and "someone wants to start
// video". Bottom sheet on phones (thumb reach), centered card on desktop.
export default function ConnectionPrompt({
  title,
  subtitle,
  acceptLabel,
  declineLabel,
  onAccept,
  onDecline,
  color = "var(--accent)",
  icon,
}: {
  title: string;
  subtitle?: string;
  acceptLabel: string;
  declineLabel: string;
  onAccept: () => void;
  onDecline: () => void;
  color?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className="anim-fade absolute inset-0 z-50 flex items-end justify-center bg-black/50 p-3 backdrop-blur-[2px] md:items-center md:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-title"
    >
      <div className="glass-strong anim-rise w-full max-w-sm rounded-[28px] p-6 pt-8 text-center">
        <div
          className="radar relative mx-auto grid size-16 place-items-center rounded-full"
          style={{ ["--accent" as string]: color }}
        >
          <span
            className="grid size-14 place-items-center rounded-full text-[var(--accent-ink)]"
            style={{
              background: color,
              boxShadow: `0 0 30px 4px color-mix(in srgb, ${color} 55%, transparent)`,
            }}
          >
            {icon}
          </span>
        </div>
        <h2 id="prompt-title" className="mt-6 text-xl font-semibold tracking-tight">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-1.5 text-sm leading-relaxed text-ink-dim">{subtitle}</p>
        )}
        <div className="mt-6 flex gap-3">
          <button
            onClick={onDecline}
            className="btn-ghost h-12 flex-1 rounded-full text-sm font-medium"
          >
            {declineLabel}
          </button>
          <button
            onClick={onAccept}
            autoFocus
            className="btn-primary h-12 flex-1 rounded-full text-sm"
          >
            {acceptLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
