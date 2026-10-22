import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { audit } from "~/modules/audit/audit.server";
import { requirePermission } from "~/modules/auth/policy.server";
import type { SessionUser } from "~/modules/auth/session.server";
import { prisma } from "~/modules/core/db.server";
import { ValidationError } from "~/modules/core/errors";

import { SETTINGS, type SettingKey } from "./definitions";

export { SETTINGS, type SettingKey };

export async function getSetting(key: SettingKey): Promise<boolean> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  return typeof row?.value === "boolean" ? row.value : SETTINGS[key].default;
}

export async function allSettings(): Promise<Record<SettingKey, boolean>> {
  const rows = await prisma.systemSetting.findMany();
  const out = {} as Record<SettingKey, boolean>;
  for (const k of Object.keys(SETTINGS) as SettingKey[]) {
    const v = rows.find((r) => r.key === k)?.value;
    out[k] = typeof v === "boolean" ? v : SETTINGS[k].default;
  }
  return out;
}

export async function saveSetting(user: SessionUser | null, key: string, value: unknown) {
  const u = requirePermission(user, "settings:manage");
  if (!(key in SETTINGS)) throw new ValidationError("Unknown setting");
  const v = z.boolean().parse(value);
  await prisma.$transaction(async (tx) => {
    await tx.systemSetting.upsert({
      where: { key },
      create: { key, value: v as Prisma.InputJsonValue, updatedById: u.id },
      update: { value: v as Prisma.InputJsonValue, updatedById: u.id },
    });
    await audit(
      {
        actorId: u.id,
        action: "settings.changed",
        entityType: "setting",
        entityId: key,
        metadata: { value: v },
      },
      tx,
    );
  });
}
