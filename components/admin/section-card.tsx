import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SectionCardProps = {
  children: ReactNode;
  className?: string;
  title?: string;
  description?: string;
  aside?: ReactNode;
};

export function SectionCard({ children, className, title, description, aside }: SectionCardProps) {
  return (
    <section
      className={cn(
        "rounded-3xl border border-slate-200/80 bg-white p-5 shadow-soft ring-1 ring-white/70 lg:p-6",
        className
      )}
    >
      {title || description || aside ? (
        <div className="mb-5 flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {title ? <h2 className="text-lg font-semibold tracking-tight text-slate-950">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p> : null}
          </div>
          {aside ? <div className="shrink-0">{aside}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
