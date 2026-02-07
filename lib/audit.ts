import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type AuditPayload = {
  userId: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  detail?: Prisma.InputJsonValue | null;
};

export async function logAuditEvent({
  userId,
  action,
  targetType,
  targetId,
  detail,
}: AuditPayload) {
  try {
    await prisma.auditEvent.create({
      data: {
        userId,
        action,
        targetType: targetType ?? null,
        targetId: targetId ?? null,
        detail:
          detail === undefined
            ? undefined
            : detail === null
              ? Prisma.JsonNull
              : detail,
      },
    });
  } catch {}
}
