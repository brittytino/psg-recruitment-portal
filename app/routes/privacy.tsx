import type { Route } from "./+types/privacy";
import { Alert } from "~/components/forms";
import { PRIVACY_NOTICE_VERSION } from "~/lib/privacy";

export const meta: Route.MetaFunction = () => [{ title: "Privacy notice — PSG Tech Recruitment" }];

export default function Privacy() {
  return (
    <article className="max-w-3xl space-y-5">
      <h1>Privacy notice</h1>
      <Alert tone="warning" title="Draft — pending institutional and legal review">
        This notice describes how the portal is built to handle personal data. The final wording, retention periods and contact for data
        requests must be approved by the college before production use. Version {PRIVACY_NOTICE_VERSION}.
      </Alert>
      <section className="space-y-2 text-sm">
        <h2>What we collect</h2>
        <p>
          The information requested by the official application form (personal details, addresses, qualifications, employment history,
          references and other information you provide), your photograph and the supporting documents you upload, and account data (e-mail
          address, sign-in records).
        </p>
        <h2>Why we collect it</h2>
        <p>Solely to process your application for faculty recruitment at PSG College of Technology.</p>
        <h2>Who can access it</h2>
        <p>
          You, and authorised recruitment staff whose role and assigned scope (recruitment cycle or department) cover your application. Every
          staff access to documents and every decision is recorded in an audit log.
        </p>
        <h2>How it is protected</h2>
        <p>
          Data is stored in private storage that is never publicly accessible, transmitted over encrypted connections, and protected by
          role-based access control. Uploaded files are scanned for malware.
        </p>
        <h2>How long we keep it</h2>
        <p>The retention period is awaiting confirmation by the college. Data will be deleted through an authorised process at its end.</p>
      </section>
    </article>
  );
}
