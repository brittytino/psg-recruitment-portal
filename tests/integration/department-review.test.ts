import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDraft,
  getStaffApplication,
  saveDraft,
  submit,
  submissionIssues,
  getOwnApplication,
} from "~/modules/applications/service.server";
import type { RoleName } from "~/modules/auth/permissions";
import type { SessionUser } from "~/modules/auth/session.server";
import { prisma } from "~/modules/core/db.server";
import { generateBundle } from "~/modules/documents/pipeline.server";
import { authorizeGeneratedDownload, uploadDocument } from "~/modules/documents/service.server";
import { getFile } from "~/modules/documents/storage.server";
import { exportCsv, listApplications, listQuerySchema } from "~/modules/reporting/applications.server";
import {
  approveSummarySheet,
  assignToHod,
  decidePositionChange,
  recordHodDecision,
  reopenSummarySheet,
} from "~/modules/reviews/service.server";
import { inviteForInterview } from "~/modules/applications/interview.server";
import { createDepartment, updateVacancy } from "~/modules/recruitment/service.server";
import { revokeRole, setUserStatus } from "~/modules/users/service.server";
import { facultyV2Minimal, testPhotoPng } from "../fixtures/applications";

const tag = randomUUID()
  .slice(0, 6)
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, "X");
let deptCode: string;
let deptId: string;
let otherDeptId: string;
let vacAssoc: string;

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
  return {
    id: u.id,
    email: u.email,
    emailVerified: true,
    displayName: u.email,
    grants: [{ role, departmentId: departmentId ?? null }],
    sessionId: randomUUID(),
  };
}

const pdf = async (pages = 1) => {
  const d = await PDFDocument.create();
  for (let i = 0; i < pages; i++) d.addPage([595, 842]).drawText(`Page ${i + 1}`, { x: 50, y: 700 });
  return d.save();
};
const file = (data: Uint8Array, name: string) => new File([Buffer.from(data)], name);

beforeAll(async () => {
  deptCode = `V${tag}`.slice(0, 8);
  deptId = (await prisma.department.create({ data: { code: deptCode, name: `IT v2 dept ${tag}` } })).id;
  otherDeptId = (
    await prisma.department.create({ data: { code: `W${tag}`.slice(0, 8), name: `IT v2 other ${tag}` } })
  ).id;
  const cycle = { opensAt: new Date(Date.now() - 86400_000), closesAt: new Date(Date.now() + 86400_000) };
  const tpl = await prisma.formTemplate.findUniqueOrThrow({
    where: { code_version: { code: "ASSOCIATE_PROFESSOR", version: 2 } },
  });
  vacAssoc = (
    await prisma.vacancy.create({
      data: {
        code: `ITV2-${tag}-ASP`,
        departmentId: deptId,
        position: "ASSOCIATE_PROFESSOR",
        formTemplateId: tpl.id,
        title: "IT v2 Associate Professor",
        description: "Integration test vacancy",
        opensAt: cycle.opensAt,
        closesAt: cycle.closesAt,
        status: "PUBLISHED",
      },
    })
  ).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Fills, uploads and submits a complete v2 application. */
async function submitted() {
  const cand = await makeUser("CANDIDATE");
  const app = await createDraft(cand, vacAssoc);
  const ug = await uploadDocument(cand, app.id, "DEGREE_CERTIFICATE", file(await pdf(), "ug.pdf"));
  const pg = await uploadDocument(cand, app.id, "DEGREE_CERTIFICATE", file(await pdf(2), "pg.pdf"));
  await uploadDocument(cand, app.id, "PHOTOGRAPH", file(testPhotoPng(), "photo.png"));
  await uploadDocument(cand, app.id, "SIGNATURE", file(testPhotoPng(300, 100), "sign.png"));
  await uploadDocument(cand, app.id, "RESUME", file(await pdf(2), "resume.pdf"));
  await uploadDocument(cand, app.id, "SALARY_SLIP", file(await pdf(), "slip.pdf"));
  const s = await saveDraft(cand, app.id, facultyV2Minimal([ug.id, pg.id]), app.draftVersion);
  // Photograph and signature must be scanned before submission; the worker does that normally.
  await prisma.applicationDocument.updateMany({
    where: { applicationId: app.id },
    data: { scanStatus: "CLEAN" },
  });
  const r = await submit(cand, app.id, s.version);
  return { cand, app, ...r };
}

describe("v2 application", () => {
  it("blocks submission until photograph and signature are scanned", async () => {
    const cand = await makeUser("CANDIDATE");
    const app = await createDraft(cand, vacAssoc);
    await uploadDocument(cand, app.id, "PHOTOGRAPH", file(testPhotoPng(), "photo.png"));
    const issues = await submissionIssues(await getOwnApplication(cand, app.id));
    expect(issues.documents.join(" ")).toMatch(/still being checked/);
    expect(issues.documents.join(" ")).toMatch(/Signature is required/);
    expect(issues.documents.join(" ")).toMatch(/Resume/);
  });

  it("issues sequential department-wise references and renders PDFs without the converter", async () => {
    const a = await submitted();
    const b = await submitted();
    const n = (ref: string) => Number(ref.split("_").pop());
    expect(a.referenceNo).toMatch(new RegExp(`^PSGCT2026-27${deptCode}_\\d{4}$`));
    expect(n(b.referenceNo)).toBe(n(a.referenceNo) + 1);

    const rev = await prisma.applicationRevision.findFirstOrThrow({ where: { applicationId: a.app.id } });
    expect(rev.competitiveExams).toEqual(["GATE"]);
    expect(rev.totalExperienceMonths).toBe(60);
    expect(rev.phdStatus).toBe("Not applicable");

    const gen = await prisma.generatedDocument.findFirstOrThrow({ where: { applicationId: a.app.id } });
    await generateBundle(gen.id, 1);
    const ready = await prisma.generatedDocument.findMany({
      where: { applicationId: a.app.id, status: "READY" },
    });
    const bundle = ready.find((g) => g.kind === "CONSOLIDATED_BUNDLE")!;
    const form = ready.find((g) => g.kind === "APPLICATION_PDF")!;
    expect(form).toBeDefined();
    const report = bundle.report as {
      applicationPages: number;
      indexPages: number;
      attachments: { documentType: string }[];
    };
    // UG 1 + PG 2 + resume 2 + slip 1 pages; photograph and signature are printed, not attached.
    expect(report.attachments.map((x) => x.documentType)).not.toContain("SIGNATURE");
    expect(bundle.pageCount).toBe(report.applicationPages + report.indexPages + 6);
    expect((await PDFDocument.load(await getFile(bundle.storageKey!))).getPageCount()).toBe(bundle.pageCount);

    // Candidates can download both their application form and their consolidated bundle.
    expect((await authorizeGeneratedDownload(a.cand, form.id)).id).toBe(form.id);
    expect((await authorizeGeneratedDownload(a.cand, bundle.id)).id).toBe(bundle.id);
  });

  it("concurrent submissions in one department get distinct references", async () => {
    const [x, y] = await Promise.all([submitted(), submitted()]);
    expect(x.referenceNo).not.toBe(y.referenceNo);
  });
});

describe("department review", () => {
  it("HOD recommends a lower post; only Admin approval sets it; the submitted revision is unchanged", async () => {
    const { app } = await submitted();
    const hr = await makeUser("HR");
    const admin = await makeUser("ADMIN");
    const hod = await makeUser("HOD", deptId);
    await assignToHod(admin, { hodId: hod.id, applicationIds: [app.id] });
    const before = await prisma.applicationRevision.findFirstOrThrow({ where: { applicationId: app.id } });

    await expect(
      recordHodDecision(hod, app.id, {
        decision: "RECOMMEND_CHANGE",
        toPosition: "PROFESSOR",
        reason: "Upgrade please",
      }),
    ).rejects.toThrow(/lower position/);
    await recordHodDecision(hod, app.id, {
      decision: "RECOMMEND_CHANGE",
      toPosition: "ASSISTANT_PROFESSOR",
      reason: "Experience suits the Assistant Professor cadre.",
    });
    const req = await prisma.positionChangeRequest.findFirstOrThrow({ where: { applicationId: app.id } });
    await expect(decidePositionChange(hr, req.id, true, "")).rejects.toThrow(/permission/);
    await expect(decidePositionChange(hod, req.id, true, "")).rejects.toThrow(/permission/);
    await decidePositionChange(admin, req.id, true, "Agreed");

    const a = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
    expect(a.appliedPosition).toBe("ASSOCIATE_PROFESSOR");
    expect(a.effectivePosition).toBe("ASSISTANT_PROFESSOR");
    const after = await prisma.applicationRevision.findFirstOrThrow({ where: { applicationId: app.id } });
    expect(after.answersSha256).toBe(before.answersSha256);
    expect(
      await prisma.auditEvent.count({ where: { entityId: app.id, action: "position_change.approved" } }),
    ).toBe(1);
  });

  it("a HOD of another department cannot be assigned or act", async () => {
    const { app } = await submitted();
    const admin = await makeUser("ADMIN");
    const other = await makeUser("HOD", otherDeptId);
    await expect(assignToHod(admin, { hodId: other.id, applicationIds: [app.id] })).rejects.toThrow(
      /does not review/,
    );
    await expect(recordHodDecision(other, app.id, { decision: "ACCEPT" })).rejects.toThrow(/not found/i);
    await expect(getStaffApplication(other, app.id)).rejects.toThrow(/not found/i);
  });

  it("summary sheet: needs every decision, is immutable, locks decisions until reopened", async () => {
    const hod = await makeUser("HOD", deptId);
    const admin = await makeUser("ADMIN");
    // Decide everything already assigned in this department so the sheet can be generated.
    const { app } = await submitted();
    await assignToHod(admin, { hodId: hod.id, applicationIds: [app.id] });
    await expect(approveSummarySheet(hod, deptId)).rejects.toThrow(/Decide every application/);
    const open = await prisma.application.findMany({
      where: { departmentId: deptId, status: "ASSIGNED_TO_HOD" },
    });
    for (const o of open)
      await prisma.application.update({ where: { id: o.id }, data: { assignedHodId: hod.id } });
    for (const o of open)
      await recordHodDecision(hod, o.id, { decision: "REJECT", reason: "Does not meet the criteria." });

    const sheet = await approveSummarySheet(hod, deptId);
    expect(sheet.version).toBeGreaterThanOrEqual(1);
    await expect(prisma.summarySheet.update({ where: { id: sheet.id }, data: { rows: [] } })).rejects.toThrow(
      /immutable/,
    );
    await expect(recordHodDecision(hod, app.id, { decision: "ACCEPT" })).rejects.toThrow(/reopen/);

    await reopenSummarySheet(admin, sheet.id, "HOD asked to correct a decision");
    await recordHodDecision(hod, app.id, { decision: "ACCEPT" });
    const v2 = await approveSummarySheet(hod, deptId);
    expect(v2.version).toBe(sheet.version + 1);
  });
});

describe("HR filters and export", () => {
  it("filters by GATE and Ph.D. and exports the chosen columns", async () => {
    const { app } = await submitted();
    const hr = await makeUser("HR");
    const q = listQuerySchema.parse({ departmentId: deptId, exam: "GATE", phd: "none", size: 100 });
    const list = await listApplications(hr, q);
    expect(list.rows.some((r) => r.id === app.id)).toBe(true);
    const none = await listApplications(hr, listQuerySchema.parse({ departmentId: deptId, phd: "awarded" }));
    expect(none.rows.some((r) => r.id === app.id)).toBe(false);

    const { csv, rows } = await exportCsv(hr, q, [
      "sNo",
      "candidateName",
      "department",
      "appliedFor",
      "status",
      "exams",
    ]);
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe(
      '﻿"S. No.","Candidate Name","Department","Applied For","Status","Competitive Exams"',
    );
    expect(lines.length - 1).toBe(rows);
    expect(csv).toContain('"GATE"');
    const hod = await makeUser("HOD", deptId);
    await expect(exportCsv(hod, q, ["sNo"])).rejects.toThrow();
  });
});

describe("HR – N4 flows", () => {
  it("creating a department requires a HOD and e-mails the HOD an invitation link", async () => {
    const hr = await makeUser("HR");
    const code = `H${tag}`.slice(0, 8);
    await expect(
      createDepartment(hr, { code, name: `IT HOD dept ${tag}`, hodName: "", hodEmail: "" }),
    ).rejects.toThrow(/correct/);
    const email = `hod-${tag.toLowerCase()}@it.example.test`;
    const d = await createDepartment(hr, {
      code,
      name: `IT HOD dept ${tag}`,
      hodName: "Dr. Test",
      hodEmail: email,
    });
    const hodUser = await prisma.user.findUniqueOrThrow({ where: { email }, include: { roles: true } });
    expect(hodUser.roles.some((r) => r.role === "HOD" && r.departmentId === d.id)).toBe(true);
    const n = await prisma.notification.findFirstOrThrow({
      where: { userId: hodUser.id, type: "account.hod_invite" },
    });
    expect(n.body).toContain(`/login?email=${encodeURIComponent(email)}`);
    expect(await prisma.outboxEvent.count({ where: { payload: { equals: { notificationId: n.id } } } })).toBe(
      1,
    );
  });

  it("HR edits a job opening; position stays fixed", async () => {
    const hr = await makeUser("HR");
    const before = await prisma.vacancy.findUniqueOrThrow({ where: { id: vacAssoc } });
    const closes = new Date(Date.now() + 20 * 86400_000).toISOString();
    await updateVacancy(hr, vacAssoc, {
      description: "Updated description for the post.",
      numberOfPosts: "3",
      opensAt: before.opensAt.toISOString(),
      closesAt: closes,
      eligibility: "Ph.D.\nFirst class PG",
    });
    const after = await prisma.vacancy.findUniqueOrThrow({
      where: { id: vacAssoc },
      include: { eligibility: true },
    });
    expect(after.numberOfPosts).toBe(3);
    expect(after.position).toBe(before.position);
    expect(after.eligibility).toHaveLength(2);
    await expect(updateVacancy(await makeUser("HOD", deptId), vacAssoc, {})).rejects.toThrow(/permission/);
  });

  it("after the HOD accepts, HR calls the candidate for interview and the candidate is e-mailed", async () => {
    const { app } = await submitted();
    const hr = await makeUser("HR");
    const admin = await makeUser("ADMIN");
    const hod = await makeUser("HOD", deptId);
    const when = new Date(Date.now() + 7 * 86400_000).toISOString();
    const details = { interviewAt: when, interviewVenue: "Board Room, Admin Block" };
    await expect(inviteForInterview(hr, app.id, details)).rejects.toThrow(/HOD/);
    await assignToHod(admin, { hodId: hod.id, applicationIds: [app.id] });
    await expect(inviteForInterview(hr, app.id, details)).rejects.toThrow(/HOD/);
    await recordHodDecision(hod, app.id, { decision: "ACCEPT" });
    await expect(inviteForInterview(hod, app.id, details)).rejects.toThrow(/permission/);
    await expect(
      inviteForInterview(hr, app.id, {
        ...details,
        interviewAt: new Date(Date.now() - 3600_000).toISOString(),
      }),
    ).rejects.toThrow(/correct/);
    await inviteForInterview(hr, app.id, { ...details, interviewNotes: "Bring originals." });
    const a = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
    expect(a.status).toBe("SHORTLISTED");
    expect(a.interviewVenue).toBe("Board Room, Admin Block");
    const mail = await prisma.notification.findFirstOrThrow({
      where: { userId: a.candidateId, type: "application.interview_call" },
    });
    expect(mail.subject).toMatch(/Call for interview/);
    expect(mail.body).toContain("Board Room, Admin Block");
    // Rescheduling e-mails the updated details and keeps the status.
    await inviteForInterview(hr, app.id, { ...details, interviewVenue: "Online: meet.google.com/abc" });
    expect(
      await prisma.notification.count({
        where: { userId: a.candidateId, type: "application.interview_call" },
      }),
    ).toBe(2);
  });
});

describe("visibility and Super Admin powers", () => {
  it("a new application is visible to HR, Dean/Principal and Super Admin; a HOD only once assigned", async () => {
    const { app } = await submitted();
    const q = listQuerySchema.parse({ size: 100, q: app.referenceNo! });
    for (const role of ["HR", "ADMIN", "SUPER_ADMIN"] as const) {
      const viewer = await makeUser(role);
      const list = await listApplications(viewer, q);
      expect(
        list.rows.map((r) => r.id),
        role,
      ).toContain(app.id);
      expect((await getStaffApplication(viewer, app.id)).id).toBe(app.id);
    }
    const hod = await makeUser("HOD", deptId);
    await expect(getStaffApplication(hod, app.id)).rejects.toThrow(/not found/i);
    await assignToHod(await makeUser("ADMIN"), { hodId: hod.id, applicationIds: [app.id] });
    expect((await getStaffApplication(hod, app.id)).id).toBe(app.id);
  });

  it("HOD lowers the cadre; it takes effect only after Dean/Principal approval", async () => {
    const { app } = await submitted();
    const hod = await makeUser("HOD", deptId);
    await assignToHod(await makeUser("HR"), { hodId: hod.id, applicationIds: [app.id] });
    await recordHodDecision(hod, app.id, {
      decision: "RECOMMEND_CHANGE",
      toPosition: "ASSISTANT_PROFESSOR",
      reason: "Fits the Assistant Professor cadre.",
    });
    expect(
      (await prisma.application.findUniqueOrThrow({ where: { id: app.id } })).effectivePosition,
    ).toBeNull();
    const req = await prisma.positionChangeRequest.findFirstOrThrow({ where: { applicationId: app.id } });
    await decidePositionChange(await makeUser("ADMIN"), req.id, true, "Agreed");
    expect((await prisma.application.findUniqueOrThrow({ where: { id: app.id } })).effectivePosition).toBe(
      "ASSISTANT_PROFESSOR",
    );
  });

  it("Super Admin can record the department decision on behalf of the HOD (audited)", async () => {
    const { app } = await submitted();
    const hod = await makeUser("HOD", deptId);
    const sa = await makeUser("SUPER_ADMIN");
    await assignToHod(sa, { hodId: hod.id, applicationIds: [app.id] });
    await recordHodDecision(sa, app.id, { decision: "REJECT", reason: "Does not meet the criteria." });
    expect((await prisma.application.findUniqueOrThrow({ where: { id: app.id } })).status).toBe(
      "HOD_REJECTED",
    );
    const ev = await prisma.auditEvent.findFirstOrThrow({
      where: { entityId: app.id, action: "review.hod_decision" },
    });
    expect((ev.metadata as Record<string, unknown>).onBehalfOfHod).toBe(hod.id);
    // A Dean (Admin) cannot record department decisions.
    await expect(recordHodDecision(await makeUser("ADMIN"), app.id, { decision: "ACCEPT" })).rejects.toThrow(
      /permission/,
    );
  });

  it("the last active Super Admin can never be removed or disabled", async () => {
    const sa = await makeUser("SUPER_ADMIN");
    const others = await prisma.user.findMany({
      where: { id: { not: sa.id }, status: "ACTIVE", roles: { some: { role: "SUPER_ADMIN" } } },
      select: { id: true },
    });
    await prisma.user.updateMany({
      where: { id: { in: others.map((o) => o.id) } },
      data: { status: "DISABLED" },
    });
    try {
      const sa2 = await makeUser("SUPER_ADMIN");
      await setUserStatus(sa2, sa.id, "DISABLED");
      await expect(setUserStatus(sa, sa2.id, "DISABLED")).rejects.toThrow(/Super Admin must remain/);
      const role = await prisma.userRole.findFirstOrThrow({ where: { userId: sa2.id, role: "SUPER_ADMIN" } });
      await expect(revokeRole(sa2, role.id)).rejects.toThrow(/own Super Admin/);
    } finally {
      await prisma.user.updateMany({
        where: { id: { in: others.map((o) => o.id) } },
        data: { status: "ACTIVE" },
      });
    }
  });
});
