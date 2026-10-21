import type { ReactNode } from "react";

/** Split layout for account pages: form on the left, welcome panel on the right. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-6xl overflow-hidden rounded-3xl bg-white shadow-[var(--shadow-soft)] border border-line/60 lg:grid-cols-2">
      <div className="p-5 sm:p-10 lg:p-14">{children}</div>
      <div
        aria-hidden="true"
        className="hero-gradient relative hidden flex-col justify-between p-12 lg:flex border-l border-pink-100/60"
      >
        <p className="chip w-fit">🌸 PSG Tech Careers</p>
        <div>
          <p className="text-3xl font-bold leading-tight">Teach. Research. Inspire.</p>
          <p className="mt-3 max-w-xs text-muted">
            One account to apply for faculty positions and follow your application from submission to
            decision.
          </p>
        </div>
        <div className="space-y-3">
          <div className="float-card flex w-fit items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-tile-green text-xl">💾</span>
            <span className="text-sm font-semibold">Drafts saved automatically</span>
          </div>
          <div className="float-card ml-10 flex w-fit items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-tile-purple text-xl">🔒</span>
            <span className="text-sm font-semibold">Your documents stay private</span>
          </div>
          <div className="float-card flex w-fit items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-tile-orange text-xl">📬</span>
            <span className="text-sm font-semibold">Status updates by e-mail</span>
          </div>
        </div>
      </div>
    </div>
  );
}
