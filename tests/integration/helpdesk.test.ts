import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { RoleName } from "~/modules/auth/permissions";
import type { SessionUser } from "~/modules/auth/session.server";
import { prisma } from "~/modules/core/db.server";
import { redis } from "~/modules/core/redis.server";
import { saveHelpdeskConfig } from "~/modules/helpdesk/config.server";
import {
  assignTicket,
  authorizeAttachment,
  candidateReply,
  createTicket,
  escalateTicket,
  myTicket,
  myTickets,
  setTicketPriority,
  setTicketStatus,
  staffReply,
  staffTicket,
  staffTickets,
  staffListSchema,
  ticketListSchema,
} from "~/modules/helpdesk/service.server";
import { routeHasRoom } from "~/modules/notifications/budget.server";
import { notify } from "~/modules/notifications/outbox.server";
import { testPhotoPng } from "../fixtures/applications";

async function makeUser(role: RoleName): Promise<SessionUser> {
  const u = await prisma.user.create({
    data: {
      email: `hd-${role.toLowerCase()}-${randomUUID().slice(0, 8)}@it.example.test`,
      passwordHash: "x",
      emailVerifiedAt: new Date(),
      roles: { create: { role } },
      profile: { create: { fullName: `HD ${role}`, privacyVersion: "test", privacyAcceptedAt: new Date() } },
    },
  });
  return {
    id: u.id,
    email: u.email,
    emailVerified: true,
    displayName: u.email,
    grants: [{ role, departmentId: null }],
    sessionId: randomUUID(),
  };
}

function ticketForm(over: Record<string, string> = {}, files: File[] = []) {
  const fd = new FormData();
  const v = {
    subject: "Signature upload fails",
    category: "DOCUMENT_UPLOAD",
    description: "When I upload my signature the page shows an error and the file is not saved.",
    requestId: randomUUID(),
    ...over,
  };
  for (const [k, x] of Object.entries(v)) fd.append(k, x);
  for (const f of files) fd.append("files", f);
  return fd;
}
const replyForm = (body: string, kind?: string) => {
  const fd = new FormData();
  fd.append("body", body);
  if (kind) fd.append("kind", kind);
  return fd;
};

afterAll(async () => {
  await prisma.$disconnect();
});

describe("help desk: candidates", () => {
  it("creates a ticket with a PSGHD reference, first message and notifications", async () => {
    const cand = await makeUser("CANDIDATE");
    const t = await createTicket(cand, ticketForm());
    expect(t.referenceNo).toMatch(/^PSGHD-\d{4}-\d{6}$/);
    const row = await prisma.supportTicket.findUniqueOrThrow({
      where: { id: t.id },
      include: { messages: true },
    });
    expect(row.status).toBe("OPEN");
    expect(row.priority).toBe("NORMAL");
    expect(row.messages).toHaveLength(1);
    const n = await prisma.notification.findMany({ where: { userId: cand.id, type: "helpdesk.created" } });
    expect(n).toHaveLength(1);
  });

  it("a double submit (same request id) returns the same ticket", async () => {
    const cand = await makeUser("CANDIDATE");
    const requestId = randomUUID();
    const a = await createTicket(cand, ticketForm({ requestId }));
    const b = await createTicket(cand, ticketForm({ requestId }));
    expect(b.id).toBe(a.id);
    expect(await prisma.supportTicket.count({ where: { createdById: cand.id } })).toBe(1);
  });

  it("concurrent tickets get distinct references", async () => {
    const cands = await Promise.all([1, 2, 3, 4, 5].map(() => makeUser("CANDIDATE")));
    const refs = await Promise.all(
      cands.map((c) => createTicket(c, ticketForm()).then((t) => t.referenceNo)),
    );
    expect(new Set(refs).size).toBe(5);
  });

  it("validates required fields on the server", async () => {
    const cand = await makeUser("CANDIDATE");
    await expect(createTicket(cand, ticketForm({ subject: "x" }))).rejects.toThrow(/correct/);
    await expect(createTicket(cand, ticketForm({ category: "NOPE" }))).rejects.toThrow(/correct/);
    await expect(createTicket(cand, ticketForm({ description: "short" }))).rejects.toThrow(/correct/);
  });

  it("cannot link someone else's application", async () => {
    const cand = await makeUser("CANDIDATE");
    const other = await prisma.application.findFirst({ select: { id: true, candidateId: true } });
    if (!other) return;
    await expect(createTicket(cand, ticketForm({ applicationId: other.id }))).rejects.toThrow(/correct/);
  });

  it("candidates only see their own tickets", async () => {
    const a = await makeUser("CANDIDATE");
    const b = await makeUser("CANDIDATE");
    const t = await createTicket(a, ticketForm());
    await expect(myTicket(b, t.id)).rejects.toThrow(/not found/i);
    await expect(candidateReply(b, t.id, replyForm("Hello there"))).rejects.toThrow(/not found/i);
    const list = await myTickets(b, ticketListSchema.parse({}));
    expect(list.rows.map((r) => r.id)).not.toContain(t.id);
  });

  it("staff cannot use the candidate help desk and candidates cannot use the staff one", async () => {
    const hr = await makeUser("HR");
    const cand = await makeUser("CANDIDATE");
    await expect(createTicket(hr, ticketForm())).rejects.toThrow(/candidates/);
    await expect(staffTickets(cand, staffListSchema.parse({}))).rejects.toThrow();
  });

  it("checks attachments by content and keeps them private", async () => {
    const a = await makeUser("CANDIDATE");
    const b = await makeUser("CANDIDATE");
    const exe = new File([Buffer.from("MZ\x90\x00 this is not an image")], "screenshot.png");
    await expect(createTicket(a, ticketForm({}, [exe]))).rejects.toThrow(/not a PDF, JPG or PNG/);
    const png = new File([Buffer.from(testPhotoPng())], "screen.png");
    const t = await createTicket(a, ticketForm({}, [png]));
    const att = await prisma.supportAttachment.findFirstOrThrow({ where: { ticketId: t.id } });
    expect(att.storageKey).not.toContain("screen");
    expect((await authorizeAttachment(a, att.id)).id).toBe(att.id);
    await expect(authorizeAttachment(b, att.id)).rejects.toThrow(/not found/i);
    expect((await authorizeAttachment(await makeUser("HR"), att.id)).id).toBe(att.id);
    await expect(authorizeAttachment(await makeUser("HOD"), att.id)).rejects.toThrow(/not found/i);
  });
});

describe("help desk: staff", () => {
  it("only HR – N4 and Super Admin can work on tickets", async () => {
    for (const role of ["HOD", "ADMIN"] as const)
      await expect(staffTickets(await makeUser(role), staffListSchema.parse({}))).rejects.toThrow();
    expect((await staffTickets(await makeUser("HR"), staffListSchema.parse({}))).rows).toBeDefined();
    expect((await staffTickets(await makeUser("SUPER_ADMIN"), staffListSchema.parse({}))).rows).toBeDefined();
  });

  it("only the Super Admin changes help desk settings", async () => {
    await expect(
      saveHelpdeskConfig(await makeUser("HR"), { defaultAssigneeId: null, emailStaffOnNewTicket: false }),
    ).rejects.toThrow();
    await saveHelpdeskConfig(await makeUser("SUPER_ADMIN"), {
      defaultAssigneeId: null,
      emailStaffOnNewTicket: false,
    });
  });

  it("internal notes never reach the candidate", async () => {
    const cand = await makeUser("CANDIDATE");
    const hr = await makeUser("HR");
    const t = await createTicket(cand, ticketForm());
    await staffReply(hr, t.id, replyForm("Checked the logs: storage was full on that day.", "INTERNAL"));
    const view = await myTicket(cand, t.id);
    expect(view.messages.map((m) => m.body).join(" ")).not.toContain("storage was full");
    const n = await prisma.notification.findMany({ where: { userId: cand.id } });
    expect(n.map((x) => x.body).join(" ")).not.toContain("storage was full");
    // Staff see it.
    const sv = await staffTicket(hr, t.id);
    expect(sv.ticket.messages.some((m) => m.kind === "INTERNAL")).toBe(true);
  });

  it("request information → awaiting candidate → candidate reply returns it to the team", async () => {
    const cand = await makeUser("CANDIDATE");
    const hr = await makeUser("HR");
    const t = await createTicket(cand, ticketForm());
    await staffReply(hr, t.id, replyForm("Please attach a screenshot of the error.", "REQUEST_INFO"));
    let row = await prisma.supportTicket.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.status).toBe("AWAITING_CANDIDATE");
    expect(row.assigneeId).toBe(hr.id); // replying took the unassigned ticket
    await candidateReply(cand, t.id, replyForm("Here is more detail about the error."));
    row = await prisma.supportTicket.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.status).toBe("IN_PROGRESS");
  });

  it("enforces transitions; resolving needs a summary; candidates can reopen; only Super Admin reopens closed", async () => {
    const cand = await makeUser("CANDIDATE");
    const hr = await makeUser("HR");
    const sa = await makeUser("SUPER_ADMIN");
    const t = await createTicket(cand, ticketForm());
    await expect(setTicketStatus(hr, t.id, { status: "RESOLVED" })).rejects.toThrow(/correct/);
    await setTicketStatus(hr, t.id, { status: "RESOLVED", summary: "The upload limit was raised to 20 MB." });
    await expect(setTicketStatus(hr, t.id, { status: "AWAITING_CANDIDATE" })).rejects.toThrow(
      /cannot be set/,
    );
    await candidateReply(cand, t.id, replyForm("It still fails for me."));
    expect((await prisma.supportTicket.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("OPEN");
    await setTicketStatus(hr, t.id, {
      status: "CLOSED",
      summary: "Solved after clearing the browser cache.",
    });
    await expect(candidateReply(cand, t.id, replyForm("One more thing"))).rejects.toThrow(/closed/);
    await expect(setTicketStatus(hr, t.id, { status: "IN_PROGRESS" })).rejects.toThrow(/Super Admin/);
    await setTicketStatus(sa, t.id, { status: "IN_PROGRESS" });
    const events = await prisma.supportTicketEvent.findMany({ where: { ticketId: t.id } });
    expect(events.length).toBeGreaterThanOrEqual(5);
  });

  it("assigns only to support staff; priority and escalation are recorded", async () => {
    const cand = await makeUser("CANDIDATE");
    const hr = await makeUser("HR");
    const hod = await makeUser("HOD");
    const t = await createTicket(cand, ticketForm());
    await expect(assignTicket(hr, t.id, hod.id)).rejects.toThrow(/HR – N4 Section or Super Admin/);
    await assignTicket(hr, t.id, hr.id, "Mine");
    await setTicketPriority(hr, t.id, "URGENT");
    await expect(escalateTicket(hr, t.id, "short")).rejects.toThrow(/correct/);
    await escalateTicket(hr, t.id, "Storage fault on the server, needs the Super Admin.");
    const row = await prisma.supportTicket.findUniqueOrThrow({ where: { id: t.id } });
    expect(row).toMatchObject({ assigneeId: hr.id, priority: "URGENT", escalated: true });
    // Candidates cannot see who was assigned or the escalation.
    const view = await myTicket(cand, t.id);
    expect(JSON.stringify(view)).not.toContain(hr.id);
  });
});

describe("e-mail controls", () => {
  it("one notification per event: retries create nothing", async () => {
    const u = await makeUser("CANDIDATE");
    for (let i = 0; i < 3; i++)
      await prisma.$transaction((tx) => notify(tx, u.id, "helpdesk.test", "S", "B", { dedupeKey: "evt-1" }));
    expect(await prisma.notification.count({ where: { userId: u.id, type: "helpdesk.test" } })).toBe(1);
    expect(
      await prisma.outboxEvent.count({ where: { payload: { path: ["notificationId"], not: "" } } }),
    ).toBeGreaterThan(0);
  });

  it("per-route budgets: routine stops at 80% on the Gmail route, codes always go out, relay has its own budget", async () => {
    const day = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
    const keys = { gmail: `mail:sent:gmail:${day}`, relay: `mail:sent:relay:${day}` };
    const before = { gmail: await redis().get(keys.gmail), relay: await redis().get(keys.relay) };
    try {
      await redis().set(keys.gmail, "100000");
      expect(await routeHasRoom("gmail", "routine")).toBe(false);
      expect(await routeHasRoom("gmail", "critical")).toBe(false);
      expect(await routeHasRoom("gmail", "otp")).toBe(true);
      // 400 of 450: routine (limit 360) stops, critical continues.
      await redis().set(keys.gmail, "400");
      expect(await routeHasRoom("gmail", "routine")).toBe(false);
      expect(await routeHasRoom("gmail", "critical")).toBe(true);
      // The relay route is counted separately.
      await redis().set(keys.relay, "0");
      expect(await routeHasRoom("relay", "routine")).toBe(true);
      await redis().set(keys.relay, "100000");
      expect(await routeHasRoom("relay", "otp")).toBe(false);
    } finally {
      for (const r of ["gmail", "relay"] as const) {
        if (before[r] === null) await redis().del(keys[r]);
        else await redis().set(keys[r], before[r]!);
      }
    }
  });
});
