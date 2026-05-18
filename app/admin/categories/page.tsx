import { Tags } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { CategoriesManager } from "@/components/categories/categories-manager";
import { DemoCategoriesPage } from "@/components/demo/demo-pages";
import { requireUser } from "@/lib/auth";
import { ensureDefaultCategoriesForMandate } from "@/lib/categories";
import { isDemoMode } from "@/lib/demo";
import { prisma } from "@/lib/prisma";

export default async function CategoriesPage() {
  if (isDemoMode()) {
    return <DemoCategoriesPage />;
  }

  const user = await requireUser();

  await ensureDefaultCategoriesForMandate(user.mandateId);

  const categories = await prisma.category.findMany({
    where: {
      mandateId: user.mandateId
    },
    orderBy: {
      name: "asc"
    },
    include: {
      _count: {
        select: {
          demands: true
        }
      }
    }
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Classificação"
        title="Categorias"
        description="Estruture as categorias usadas pelo mandato para organizar e qualificar as demandas."
        icon={<Tags className="h-5 w-5" />}
      />

      <CategoriesManager
        mandateName={user.mandate.name}
        initialCategories={categories.map(({ _count, ...category }) => ({
          ...category,
          createdAt: category.createdAt.toISOString(),
          demandsCount: _count.demands
        }))}
      />
    </div>
  );
}
