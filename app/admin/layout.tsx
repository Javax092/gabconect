import { DashboardShell } from "@/components/layout/dashboard-shell";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();

  return <DashboardShell user={user}>{children}</DashboardShell>;
}
