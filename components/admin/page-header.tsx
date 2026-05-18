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
    <section className="overflow-hidden rounded-[34px] border border-slate-200 bg-[radial-gradient(circle_at_top_right,_rgba(59,130,246,0.09),_transparent_28%),linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] px-6 py-6 shadow-soft lg:px-7">
      <div className="mb-5 h-1.5 w-28 rounded-full bg-gradient-to-r from-brand-500 via-cyan-400 to-emerald-400" />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          {icon ? (
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,_#0f172a_0%,_#1d4ed8_100%)] text-white shadow-soft">
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
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">{description}</p>
            ) : null}
          </div>
        </div>

        {aside ? <div className="lg:min-w-[260px] lg:pl-6">{aside}</div> : null}
      </div>
    </section>
  );
}
