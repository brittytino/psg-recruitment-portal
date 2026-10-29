import { jsonLd } from "~/lib/json-ld";
import { ChevronDown, Mail, MapPin } from "lucide-react";
import type { Route } from "./+types/help";
import { env } from "~/modules/core/env.server";

export const meta: Route.MetaFunction = () => [
  { title: "Help & Frequently Asked Questions (FAQ) — PSG Tech Recruitment" },
  {
    name: "description",
    content:
      "Frequently asked questions and candidate help for PSG College of Technology faculty and research applications, forms, certificate uploads, and selection process.",
  },
  { name: "robots", content: "index, follow" },
  { property: "og:title", content: "Help & FAQ — PSG Tech Recruitment" },
  {
    property: "og:description",
    content:
      "Answers about application forms, document requirements, drafts, and submission for PSG Tech recruitment.",
  },
  { property: "og:type", content: "website" },
  { property: "og:image", content: "/images/psg_logo.png" },
  { name: "twitter:card", content: "summary" },
  { name: "twitter:image", content: "/images/psg_logo.png" },
];

export function loader() {
  return { email: env().SMTP_FROM_EMAIL };
}

const FAQ: [string, string][] = [
  [
    "Which form do I fill in?",
    "Each vacancy uses the official PSG College of Technology application form for its position: the Assistant Professor form, the Professor / Associate Professor form, or the research position form. The online form contains every section of the official form.",
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
    "Only you and authorised recruitment staff for the relevant department. See the privacy notice for details.",
  ],
];

export default function Help({ loaderData }: Route.ComponentProps) {
  return (
    <div className="page-stack mx-auto max-w-5xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQ.map(([q, a]) => ({
              "@type": "Question",
              name: q,
              acceptedAnswer: {
                "@type": "Answer",
                text: a,
              },
            })),
          }),
        }}
      />
      <header className="border-b border-line pb-6">
        <p className="eyebrow">Help</p>
        <h1 className="mt-1">How to apply</h1>
        <p className="mt-2 text-muted">
          Answers about the application form, documents, drafts and what happens after you submit.
        </p>
      </header>

      <section aria-labelledby="faq" className="grid gap-3 md:grid-cols-2">
        <h2 id="faq" className="sr-only">
          Frequently asked questions
        </h2>
        {FAQ.map(([q, a]) => (
          <details key={q} className="group card h-fit p-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-ink [&::-webkit-details-marker]:hidden">
              <span>{q}</span>
              <ChevronDown
                className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <p className="mt-3 border-t border-line pt-3 text-sm text-muted">{a}</p>
          </details>
        ))}
      </section>

      <section id="contact" aria-labelledby="contact-h" className="card space-y-4">
        <h2 id="contact-h">Contact the recruitment office</h2>
        <ul className="space-y-3 text-sm">
          <li className="flex items-start gap-3">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
            <a href={`mailto:${loaderData.email}`}>{loaderData.email}</a>
          </li>
          <li className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
            <span>PSG College of Technology, Avinashi Road, Peelamedu, Coimbatore – 641 004, Tamil Nadu</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
