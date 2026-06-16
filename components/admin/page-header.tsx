import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  aside?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, icon, aside }: PageHeaderProps) {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-[radial-gradient(circle_at_top_right,_rgba(20,184,166,0.13),_transparent_28%),linear-gradient(135deg,_#ffffff_0%,_#f8fbff_54%,_#eef6ff_100%)] px-6 py-6 shadow-soft ring-1 ring-white/70 lg:px-7">
      <div className="mb-5 h-px w-full bg-gradient-to-r from-brand-600/40 via-teal-400/30 to-transparent" />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          {icon ? (
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-brand-100 bg-white text-brand-700 shadow-sm">
              {icon}
            </div>
          ) : null}

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-700">
              {eyebrow}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 lg:text-3xl">
              {title}
            </h1>
            {description ? (
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
            ) : null}
          </div>
        </div>

        {aside ? <div className="lg:min-w-[260px] lg:pl-6">{aside}</div> : null}
      </div>
    </section>
  );
}
