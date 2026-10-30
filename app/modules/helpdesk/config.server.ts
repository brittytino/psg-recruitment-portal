import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { audit } from "~/modules/audit/audit.server";
import { requirePermission } from "~/modules/auth/policy.server";
import type { SessionUser } from "~/modules/auth/session.server";
import { prisma } from "~/modules/core/db.server";
import { ValidationError } from "~/modules/core/errors";

/**
 * Help desk configuration (Super Admin), stored in the existing system_settings table under one
 * key. Defaults: new tickets wait in the Unassigned queue; staff are told in the app, not by e-mail
 * (saves the daily e-mail quota).
 */
const KEY = "helpdesk.config";
export interface HelpdeskConfig {
  /** null = new tickets stay unassigned. */
  defaultAssigneeId: string | null;
  /** Also e-mail support staff about every new ticket (in-app notice is always given). */
  emailStaffOnNewTicket: boolean;
}
const DEFAULTS: HelpdeskConfig = { defaultAssigneeId: null, emailStaffOnNewTicket: false };

/** Active accounts that may work on tickets (HR – N4 Section and Super Admin). */
export function supportStaff() {
  return prisma.user.findMany({
    where: { status: "ACTIVE", roles: { some: { role: { in: ["HR", "SUPER_ADMIN"] } } } },
    select: {
      id: true,
      email: true,
      profile: { select: { fullName: true } },
      roles: { select: { role: true } },
    },
    orderBy: { email: "asc" },
    take: 200,
  });
}

export async function isSupportStaff(userId: string): Promise<boolean> {
  return (
    (await prisma.user.count({
      where: { id: userId, status: "ACTIVE", roles: { some: { role: { in: ["HR", "SUPER_ADMIN"] } } } },
    })) > 0
  );
}

export async function getHelpdeskConfig(): Promise<HelpdeskConfig> {
  const row = await prisma.systemSetting.findUnique({ where: { key: KEY } });
  const v = (row?.value ?? {}) as Partial<HelpdeskConfig>;
  const cfg = { ...DEFAULTS, ...v };
  // A default assignee who has since lost access is ignored.
  if (cfg.defaultAssigneeId && !(await isSupportStaff(cfg.defaultAssigneeId))) cfg.defaultAssigneeId = null;
  return cfg;
}

const schema = z.object({
  defaultAssigneeId: z.string().uuid().nullable(),
  emailStaffOnNewTicket: z.boolean(),
});

export async function saveHelpdeskConfig(user: SessionUser | null, input: unknown) {
  const u = requirePermission(user, "helpdesk:admin");
  const p = schema.safeParse(input);
  if (!p.success) throw new ValidationError("Please correct the highlighted fields");
  if (p.data.defaultAssigneeId && !(await isSupportStaff(p.data.defaultAssigneeId)))
    throw new ValidationError("Choose an active HR – N4 Section or Super Admin account", {
      defaultAssigneeId: ["Not a support staff account"],
    });
  await prisma.$transaction(async (tx) => {
    await tx.systemSetting.upsert({
      where: { key: KEY },
      create: { key: KEY, value: p.data as Prisma.InputJsonObject, updatedById: u.id },
      update: { value: p.data as Prisma.InputJsonObject, updatedById: u.id },
    });
    await audit(
      {
        actorId: u.id,
        action: "helpdesk.config_changed",
        entityType: "setting",
        entityId: KEY,
        metadata: p.data,
      },
      tx,
    );
  });
}
