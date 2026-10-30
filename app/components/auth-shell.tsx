import type { ReactNode } from "react";
import { BellRing, LockKeyhole, Save } from "lucide-react";

/** Split layout for account pages: form on the left, institutional panel on the right. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-[var(--radius-card)] border border-line bg-paper shadow-[var(--shadow-soft)] lg:grid-cols-[1.1fr_1fr]">
      <div className="p-6 sm:p-10 lg:p-12">{children}</div>
      <div
        aria-hidden="true"
        className="relative hidden flex-col justify-between gap-10 border-l border-line bg-canvas p-10 lg:flex"
      >
        <div className="flex items-center gap-3">
          <img src="/images/psg_logo.png" alt="" className="h-11 w-auto rounded" />
          <p className="text-sm leading-tight font-semibold text-ink">
            PSG College of Technology
            <span className="block font-normal text-muted">Faculty & Research Recruitment</span>
          </p>
        </div>
        <div>
          <p className="font-display text-3xl leading-tight font-semibold text-navy-800">
            Teach. Research. Lead.
          </p>
          <p className="mt-3 max-w-sm text-muted">
            One account to apply for faculty and research positions and follow each application from
            submission to decision.
          </p>
        </div>
        <ul className="space-y-3 text-sm text-ink">
          {[
            [Save, "Drafts are saved automatically"],
            [LockKeyhole, "Documents stay private to the recruitment office"],
            [BellRing, "Status updates by e-mail"],
          ].map(([Icon, text]) => {
            const I = Icon as typeof Save;
            return (
              <li key={text as string} className="flex items-center gap-3">
                <span className="grid h-8 w-8 place-items-center rounded-md bg-brand-50 text-brand-700 ring-1 ring-brand-100">
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
