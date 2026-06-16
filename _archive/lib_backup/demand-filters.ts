import { Prisma } from "@prisma/client";

type DemandFilterInput = {
  mandateId: string;
  status?: string;
  priority?: string;
  categoryId?: string;
  q?: string;
};

export function buildDemandWhere({
  mandateId,
  status,
  priority,
  categoryId,
  q
}: DemandFilterInput): Prisma.DemandWhereInput {
  const search = q?.trim();

  return {
    mandateId,
    ...(status ? { status: status as never } : {}),
    ...(priority ? { priority: priority as never } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(search
      ? {
          OR: [
            {
              title: {
                contains: search,
                mode: "insensitive"
              }
            },
            {
              description: {
                contains: search,
                mode: "insensitive"
              }
            },
            {
              citizen: {
                name: {
                  contains: search,
                  mode: "insensitive"
                }
              }
            }
          ]
        }
      : {})
  };
}
