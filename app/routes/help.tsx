import type { Route } from "./+types/help";
import { Alert } from "~/components/forms";

export const meta: Route.MetaFunction = () => [{ title: "Help and FAQ — PSG Tech Recruitment" }];

const FAQ: [string, string][] = [
  ["Which form do I fill in?", "Each vacancy uses the official PSG College of Technology application form for its position: the Assistant Professor form, or the Professor / Associate Professor form. The online form contains every section of the official form."],
  ["Can I save and continue later?", "Yes. Use “Save draft” at any time; your answers are stored securely and you can continue from your account page. The time of the last save is shown on every section."],
  ["What happens when I submit?", "Your answers and documents are frozen as a submitted snapshot and you receive an application reference number by e-mail. The official application PDF, with your photograph and supporting documents, is then generated for the recruitment office."],
  ["Can I change my application after submitting?", "Not directly. If the recruitment office needs clarification it will return the application to you; you can then update and resubmit it. Each submission is kept as a separate, unchangeable revision."],
  ["What files can I upload?", "PDF, JPEG or PNG files up to the size shown on the upload page. The photograph must be a JPEG or PNG image. Password-protected PDFs cannot be accepted. All files are scanned for malware."],
  ["I am currently employed. Anything else?", "The official form states: candidates already employed should send their applications only through their present employer. The printed form includes a section for the endorsement of your present employer."],
  ["Who can see my application?", "Only you and authorised recruitment staff for the relevant recruitment cycle and department. See the privacy notice for details."],
];

export default function Help() {
  return (
    <div className="space-y-8">
      <h1>Help and frequently asked questions</h1>
      <section aria-labelledby="faq" className="space-y-3">
        <h2 id="faq" className="sr-only">
          Frequently asked questions
        </h2>
        {FAQ.map(([q, a]) => (
          <details key={q} className="card">
            <summary className="cursor-pointer font-medium">{q}</summary>
            <p className="mt-2 text-sm">{a}</p>
          </details>
        ))}
      </section>
      <section id="contact" aria-labelledby="contact-h" className="card space-y-3">
        <h2 id="contact-h">Contact</h2>
        <Alert tone="warning" title="Placeholder — awaiting approved content">
          The recruitment office contact details (e-mail, telephone and office hours) have not yet been provided by the college and must be
          added before this portal is used publicly.
        </Alert>
        <p className="text-sm">PSG College of Technology, Peelamedu, Coimbatore – 641 004</p>
      </section>
    </div>
  );
}
