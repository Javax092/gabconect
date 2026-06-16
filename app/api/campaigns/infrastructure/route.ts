import { apiError, apiSuccess } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import { getCachedOperationalControlSnapshot } from "@/lib/operational-cache";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);

    const mandate = await prisma.mandate.findUniqueOrThrow({
      where: {
        id: mandateId
      },
      select: {
        whatsappNumber: true
      }
    });

    return apiSuccess(await getCachedOperationalControlSnapshot(mandateId, mandate.whatsappNumber));
  } catch (error) {
    return apiError(error);
  }
}
