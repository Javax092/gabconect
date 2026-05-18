import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SectionCardProps = {
  children: ReactNode;
  className?: string;
};

export function SectionCard({ children, className }: SectionCardProps) {
  return (
    <section
      className={cn(
        "rounded-[30px] border border-slate-200 bg-white p-5 shadow-soft lg:p-6",
        className
      )}
    >
      {children}
    </section>
  );
}
