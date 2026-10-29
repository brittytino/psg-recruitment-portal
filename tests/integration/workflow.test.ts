import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDraft,
  getStaffApplication,
  saveDraft,
  submit,
  transition,
} from "~/modules/applications/service.server";
import type { SessionUser } from "~/modules/auth/session.server";
import { prisma } from "~/modules/core/db.server";
import { generateBundle } from "~/modules/documents/pipeline.server";
import { scanBytes } from "~/modules/documents/scan.server";
import { authorizeDocumentDownload, uploadDocument } from "~/modules/documents/service.server";
import { getFile, getVerifiedFile } from "~/modules/documents/storage.server";
import { listApplications, listQuerySchema } from "~/modules/reporting/applications.server";
import { assignToHod, recordHodDecision } from "~/modules/reviews/service.server";
import { assistantMinimal, associateMinimal, testPhotoPng } from "../fixtures/applications";
import type { RoleName } from "~/modules/auth/permissions";

const tag = randomUUID().slice(0, 8);
const ids: { users: string[] } = { users: [] };

async function makeUser(role: RoleName, departmentId?: string): Promise<SessionUser> {
  const u = await prisma.user.create({
    data: {
      email: `${role.toLowerCase()}-${randomUUID().slice(0, 8)}@it.example.test`,
      passwordHash: "x",
      emailVerifiedAt: new Date(),
      roles: { create: { role, departmentId: departmentId ?? null } },
      profile: { create: { fullName: `IT ${role}`, privacyVersion: "test", privacyAcceptedAt: new Date() } },
    },
  });
  ids.users.push(u.id);
  return {
    id: u.id,
    email: u.email,
    emailVerified: true,
    displayName: u.email,
    grants: [{ role, departmentId: departmentId ?? null }],
    sessionId: randomUUID(),
  };
}

const pdfBytes = async (pages = 2) => {
  const d = await PDFDocument.create();
  for (let i = 0; i < pages; i++)
    d.addPage([595, 842]).drawText(`Attachment page ${i + 1}`, { x: 50, y: 700 });
  return d.save();
};
const file = (data: Uint8Array, name: string) => new File([Buffer.from(data)], name);

let deptA: string, deptB: string, vacAP: string, vacAS: string;

beforeAll(async () => {
  const a = await prisma.department.create({
    data: { code: `IA${tag}`.slice(0, 12), name: `IT Dept A ${tag}` },
  });
  const b = await prisma.department.create({
    data: { code: `IB${tag}`.slice(0, 12), name: `IT Dept B ${tag}` },
  });
  deptA = a.id;
  deptB = b.id;
  const cycle = { opensAt: new Date(Date.now() - 86400_000), closesAt: new Date(Date.now() + 86400_000) };
  const tpl = (code: "ASSISTANT_PROFESSOR" | "ASSOCIATE_PROFESSOR") =>
    prisma.formTemplate.findUniqueOrThrow({ where: { code_version: { code, version: 1 } } });
  const mk = async (code: string, position: "ASSISTANT_PROFESSOR" | "ASSOCIATE_PROFESSOR", dept: string) =>
    (
      await prisma.vacancy.create({
        data: {
          code: `IT-${tag}-${code}`,
          departmentId: dept,
          position,
          formTemplateId: (await tpl(position)).id,
          title: `IT vacancy ${code}`,
          description: "Integration test vacancy",
          opensAt: cycle.opensAt,
          closesAt: cycle.closesAt,
          status: "PUBLISHED",
          requiredDocuments: {
            create: [{ documentType: "DEGREE_CERTIFICATE", label: "Degree certificates", sortOrder: 0 }],
          },
        },
      })
    ).id;
  vacAP = await mk("AP", "ASSISTANT_PROFESSOR", deptA);
  vacAS = await mk("AS", "ASSOCIATE_PROFESSOR", deptB);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function submittedApplication(vacancyId: string, answers: Record<string, unknown>) {
  const cand = await makeUser("CANDIDATE");
  const app = await createDraft(cand, vacancyId);
  const s = await saveDraft(cand, app.id, answers, app.draftVersion);
  await uploadDocument(cand, app.id, "PHOTOGRAPH", file(testPhotoPng(), "photo.png"));
  await uploadDocument(cand, app.id, "DEGREE_CERTIFICATE", file(await pdfBytes(3), "degree.pdf"));
  await uploadDocument(cand, app.id, "OTHER", file(testPhotoPng(300, 200), "scan.png"));
  const r = await submit(cand, app.id, s.version);
  return { cand, app, ...r };
}

/** Runs the worker steps synchronously: scan every document, then generate the bundle. */
async function runPipeline(applicationId: string) {
  const docs = await prisma.applicationDocument.findMany({ where: { applicationId } });
  for (const d of docs) {
    const res = await scanBytes(await getVerifiedFile(d.storageKey, d.sha256));
    await prisma.applicationDocument.update({
      where: { id: d.id },
      data: { scanStatus: res.status, scannedAt: new Date() },
    });
  }
  const gen = await prisma.generatedDocument.findFirstOrThrow({
    where: { applicationId },
    orderBy: { version: "desc" },
  });
  await generateBundle(gen.id, 1);
  return prisma.generatedDocument.findUniqueOrThrow({ where: { id: gen.id } });
}

describe("candidate submission and document pipeline", () => {
  it.each([
    ["Assistant Professor", () => vacAP, assistantMinimal, 2],
    ["Associate Professor", () => vacAS, associateMinimal, 11],
  ] as const)(
    "%s: submit → scan → consolidated PDF with all attachments",
    async (_n, vac, answers, formPages) => {
      const { app, referenceNo } = await submittedApplication(vac(), answers);
      expect(referenceNo).toMatch(/^PSGCT\d{4}-\d{2}I[AB][A-Z0-9]+_\d{4}$/);
      const g = await runPipeline(app.id);
      expect(g.status).toBe("READY");
      // form pages + 3-page degree PDF + 1 image page
      // form pages + contents page + 3-page degree PDF + 1 image page
      expect(g.pageCount).toBe(formPages + 1 + 3 + 1);
      const pdf = await PDFDocument.load(await getFile(g.storageKey!));
      expect(pdf.getPageCount()).toBe(g.pageCount);
      const a = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
      expect(a.processingStatus).toBe("READY");
    },
  );

  it("submitted revisions are immutable at the database level", async () => {
    const { app } = await submittedApplication(vacAP, assistantMinimal);
    const rev = await prisma.applicationRevision.findFirstOrThrow({ where: { applicationId: app.id } });
    await expect(
      prisma.applicationRevision.update({ where: { id: rev.id }, data: { candidateName: "TAMPERED" } }),
    ).rejects.toThrow(/append-only/);
    await expect(prisma.applicationRevision.delete({ where: { id: rev.id } })).rejects.toThrow(/append-only/);
  });

  it("rejects editing after submission and duplicate/stale submissions", async () => {
    const { cand, app } = await submittedApplication(vacAP, assistantMinimal);
    const cur = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
    await expect(saveDraft(cand, app.id, assistantMinimal, cur.draftVersion)).rejects.toThrow(
      /can no longer be edited/,
    );
    await expect(submit(cand, app.id, cur.draftVersion)).rejects.toThrow(/cannot be submitted/);
  });

  it("optimistic concurrency: a stale draft version is rejected", async () => {
    const cand = await makeUser("CANDIDATE");
    const app = await createDraft(cand, vacAP);
    await saveDraft(cand, app.id, { name: "A" }, 0);
    await expect(saveDraft(cand, app.id, { name: "B" }, 0)).rejects.toThrow(/another window/);
  });

  it("concurrent submissions produce exactly one revision", async () => {
    const cand = await makeUser("CANDIDATE");
    const app = await createDraft(cand, vacAP);
    const s = await saveDraft(cand, app.id, assistantMinimal, 0);
    await uploadDocument(cand, app.id, "PHOTOGRAPH", file(testPhotoPng(), "p.png"));
    await uploadDocument(cand, app.id, "DEGREE_CERTIFICATE", file(await pdfBytes(1), "d.pdf"));
    const results = await Promise.allSettled([
      submit(cand, app.id, s.version),
      submit(cand, app.id, s.version),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.applicationRevision.count({ where: { applicationId: app.id } })).toBe(1);
  });

  it("rejects files whose content does not match an allowed type", async () => {
    const cand = await makeUser("CANDIDATE");
    const app = await createDraft(cand, vacAP);
    await expect(
      uploadDocument(
        cand,
        app.id,
        "DEGREE_CERTIFICATE",
        file(new TextEncoder().encode("<script>alert(1)</script>"), "evil.pdf"),
      ),
    ).rejects.toThrow(/allowed type/);
    await expect(
      uploadDocument(cand, app.id, "PHOTOGRAPH", file(await pdfBytes(), "photo.png")),
    ).rejects.toThrow(/JPEG or PNG/);
    await expect(
      uploadDocument(
        cand,
        app.id,
        "DEGREE_CERTIFICATE",
        file(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x00]), "broken.pdf"),
      ),
    ).rejects.toThrow(/damaged/);
  });

  it("ClamAV detects the EICAR test signature", async () => {
    const eicar = new TextEncoder().encode(
      "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
    );
    const r = await scanBytes(eicar);
    expect(r.status).toBe("INFECTED");
  });
});

describe("authorization", () => {
  it("candidates cannot read or download another candidate's records", async () => {
    const { app } = await submittedApplication(vacAP, assistantMinimal);
    const other = await makeUser("CANDIDATE");
    await expect(saveDraft(other, app.id, {}, 0)).rejects.toThrow(/not found/i);
    const doc = await prisma.applicationDocument.findFirstOrThrow({ where: { applicationId: app.id } });
    await expect(authorizeDocumentDownload(other, doc.id)).rejects.toThrow(/not found/i);
    await expect(getStaffApplication(other, app.id)).rejects.toThrow();
  });

  it("HODs see only applications of their department that are assigned to them", async () => {
    const { app } = await submittedApplication(vacAP, assistantMinimal);
    await runPipeline(app.id);
    const hr = await makeUser("HR");
    const hodA = await makeUser("HOD", deptA);
    const hodB = await makeUser("HOD", deptB);
    await expect(getStaffApplication(hodA, app.id)).rejects.toThrow(/not found/i); // not yet assigned
    await expect(assignToHod(hr, { hodId: hodB.id, applicationIds: [app.id] })).rejects.toThrow(
      /does not review/,
    );
    await assignToHod(hr, { hodId: hodA.id, applicationIds: [app.id] });
    expect((await getStaffApplication(hodA, app.id)).id).toBe(app.id);
    await expect(getStaffApplication(hodB, app.id)).rejects.toThrow(/not found/i);
    const listB = await listApplications(hodB, listQuerySchema.parse({}));
    expect(listB.rows.some((r) => r.id === app.id)).toBe(false);
    await expect(recordHodDecision(hodB, app.id, { decision: "ACCEPT" })).rejects.toThrow(/not found/i);

    await recordHodDecision(hodA, app.id, { decision: "ACCEPT", reason: "" });
    await expect(transition(hr, app.id, "APPROVED", "")).rejects.toThrow(/Cannot move/);
    await transition(hr, app.id, "SHORTLISTED", null);
    const hist = await prisma.applicationStatusHistory.count({ where: { applicationId: app.id } });
    expect(hist).toBeGreaterThanOrEqual(4);
  });

  it("HR cannot see drafts; Admin sees every submitted application", async () => {
    const cand = await makeUser("CANDIDATE");
    const draft = await createDraft(cand, vacAP);
    const hr = await makeUser("HR");
    await expect(getStaffApplication(hr, draft.id)).rejects.toThrow(/not found/i);
    const admin = await makeUser("ADMIN");
    await expect(getStaffApplication(admin, draft.id)).rejects.toThrow(/not found/i);
    const { app } = await submittedApplication(vacAS, associateMinimal);
    expect((await getStaffApplication(admin, app.id)).id).toBe(app.id);
  });
});
