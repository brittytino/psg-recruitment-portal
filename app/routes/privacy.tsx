import { originFrom, seo } from "~/lib/seo";
import type { Route } from "./+types/privacy";

export const meta: Route.MetaFunction = ({ matches }) =>
  seo({
    title: "Privacy Notice",
    description:
      "How PSG College of Technology handles the personal data of applicants during recruitment: data security, authorized access, and retention policies.",
    path: "/privacy",
    origin: originFrom(matches),
  });

export default function Privacy() {
  return (
    <article className="max-w-4xl space-y-8">
      <div className="border-b border-line/70 pb-6">
        <p className="eyebrow">Data Governance</p>
        <h1 className="mt-1.5 text-3xl font-semibold text-ink sm:text-4xl lg:text-5xl">Privacy Notice</h1>
        <p className="mt-2 text-base text-muted">
          Institutional standards for personal data handling, encryption, and audit transparency.
        </p>
      </div>
      <section className="card space-y-6 text-sm leading-relaxed text-muted sm:text-base">
        <h2>What we collect</h2>
        <p>
          The information requested by the official application forms (personal details, address,
          qualifications, teaching and research experience, publications, references), candidate photographs,
          supporting certificate uploads, and authenticated account records (e-mail address and sign-in
          timestamps).
        </p>
        <h2>Why we collect it</h2>
        <p>
          Information is collected solely to evaluate eligibility, process statutory applications, and conduct
          faculty and research recruitment at PSG College of Technology, Coimbatore.
        </p>
        <h2>Who can access it</h2>
        <p>
          Access is strictly restricted to the candidate and authorized institutional personnel: the
          Principal, Dean, HR / Recruitment Section, and Department Heads (HODs) whose assigned scope covers
          the specific application. Every administrative access, document review, and decision is permanently
          recorded in an immutable audit log.
        </p>
        <h2>How it is protected</h2>
        <p>
          All applicant data is transmitted over encrypted HTTPS connections and stored in secure,
          access-controlled institutional databases. Uploaded certificates and documents are stored in private
          volumes inaccessible to the public and scanned for malware prior to verification.
        </p>
        <h2>Data retention policy</h2>
        <p>
          Application records are retained in compliance with Anna University, Directorate of Technical
          Education (DOTE), and institutional audit guidelines. Unsuccessful candidate records are securely
          archived following completion of the selection process.
        </p>
        <h2>Contact for data inquiries</h2>
        <p>
          For questions regarding your application data or recruitment records, contact the Recruitment
          Section at{" "}
          <a
            href="mailto:recruitments@psgtech.ac.in"
            className="font-medium text-brand-600 underline hover:text-brand-700"
          >
            recruitments@psgtech.ac.in
          </a>
          .
        </p>
      </section>
    </article>
  );
}
