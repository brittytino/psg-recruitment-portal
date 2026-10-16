import type { Route } from "./+types/help";
import { Alert } from "~/components/forms";

export const meta: Route.MetaFunction = () => [{ title: "Help and FAQ — PSG Tech Recruitment" }];

const FAQ: [string, string][] = [
  [
    "Which form do I fill in?",
    "Each vacancy uses the official PSG College of Technology application form for its position: the Assistant Professor form, or the Professor / Associate Professor form. The online form contains every section of the official form.",
  ],
  [
    "Can I save and continue later?",
    "Yes. Use “Save draft” at any time; your answers are stored securely and you can continue from your account page. The time of the last save is shown on every section.",
  ],
  [
    "What happens when I submit?",
    "Your answers and documents are frozen as a submitted snapshot and you receive an application reference number by e-mail. The official application PDF, with your photograph and supporting documents, is then generated for the recruitment office.",
  ],
  [
    "Can I change my application after submitting?",
    "Not directly. If the recruitment office needs clarification it will return the application to you; you can then update and resubmit it. Each submission is kept as a separate, unchangeable revision.",
  ],
  [
    "What files can I upload?",
    "PDF, JPEG or PNG files up to the size shown on the upload page. The photograph must be a JPEG or PNG image. Password-protected PDFs cannot be accepted. All files are scanned for malware.",
  ],
  [
    "I am currently employed. Anything else?",
    "The official form states: candidates already employed should send their applications only through their present employer. The printed form includes a section for the endorsement of your present employer.",
  ],
  [
    "Who can see my application?",
    "Only you and authorised recruitment staff for the relevant recruitment cycle and department. See the privacy notice for details.",
  ],
];

export default function Help() {
  return (
    <div className="space-y-10">
      <div className="border-b border-line/70 pb-6">
        <p className="eyebrow">Support & Guidance</p>
        <h1 className="mt-1.5 text-3xl sm:text-4xl lg:text-5xl font-extrabold text-ink">
          Frequently asked questions
        </h1>
        <p className="mt-2 text-base text-muted">
          Find answers about official form formats, document uploads, application drafting, and submission workflows.
        </p>
      </div>

      <section aria-labelledby="faq" className="grid gap-4 md:grid-cols-2">
        <h2 id="faq" className="sr-only">
          Frequently asked questions
        </h2>
        {FAQ.map(([q, a]) => (
          <details key={q} className="card p-6 transition-all hover:shadow-md group">
            <summary className="cursor-pointer font-bold text-base text-ink group-open:text-brand-700 transition-colors list-none flex items-center justify-between">
              <span>{q}</span>
              <span className="text-muted group-open:rotate-180 transition-transform">▾</span>
            </summary>
            <p className="mt-3 text-sm text-muted leading-relaxed border-t border-line/60 pt-3">{a}</p>
          </details>
        ))}
      </section>

      <section id="contact" aria-labelledby="contact-h" className="card space-y-4 p-8">
        <h2 id="contact-h" className="text-2xl font-bold text-ink">Institutional Contact</h2>
        <Alert tone="warning" title="Recruitment Office Information">
          Official recruitment office contact details (direct telephone lines and visiting hours) are managed by the Dean's Office.
        </Alert>
        <p className="text-sm text-muted">PSG College of Technology, Peelamedu, Coimbatore – 641 004, Tamil Nadu, India.</p>
      </section>
    </div>
  );
}
