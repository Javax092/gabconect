"use server";

import { requireUser } from "@/lib/auth";
import { getCachedOperationalControlSnapshot } from "@/lib/operational-cache";
import { prisma } from "@/lib/prisma";

export async function getOperationalControlSnapshot() {
  const user = await requireUser();

  const mandate = await prisma.mandate.findUniqueOrThrow({
    where: {
      id: user.mandateId
    },
    select: {
      whatsappNumber: true
    }
  });

  return getCachedOperationalControlSnapshot(user.mandateId, mandate.whatsappNumber);
}
