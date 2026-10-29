import type { ReactNode } from "react";
import { BellRing, LockKeyhole, Save } from "lucide-react";

/** Split layout for account pages: form on the left, institutional panel on the right. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-[var(--radius-card)] border border-line bg-paper shadow-[var(--shadow-soft)] lg:grid-cols-[1.1fr_1fr]">
      <div className="p-6 sm:p-10 lg:p-12">{children}</div>
      <div
        aria-hidden="true"
        className="hero-gradient relative hidden flex-col justify-between gap-10 p-10 lg:flex"
      >
        <div className="flex items-center gap-3">
          <img src="/images/psg_logo.png" alt="" className="h-11 w-auto rounded bg-white p-1" />
          <p className="text-sm leading-tight font-semibold text-white/90">
            PSG College of Technology
            <span className="block font-normal text-white/60">Recruitment Portal</span>
          </p>
        </div>
        <div>
          <p className="font-display text-3xl leading-tight font-semibold">Teach. Research. Lead.</p>
          <p className="mt-3 max-w-sm text-white/75">
            One account to apply for faculty and research positions and follow each application from
            submission to decision.
          </p>
        </div>
        <ul className="space-y-3 text-sm text-white/85">
          {[
            [Save, "Drafts are saved automatically"],
            [LockKeyhole, "Documents stay private to the recruitment office"],
            [BellRing, "Status updates by e-mail"],
          ].map(([Icon, text]) => {
            const I = Icon as typeof Save;
            return (
              <li key={text as string} className="flex items-center gap-3">
                <span className="grid h-8 w-8 place-items-center rounded-md bg-white/10 ring-1 ring-white/15">
                  <I className="h-4 w-4" />
                </span>
                {text as string}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
