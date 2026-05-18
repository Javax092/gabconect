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
    <section className="overflow-hidden rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_top_right,_rgba(34,211,238,0.08),_transparent_24%),linear-gradient(180deg,_rgba(7,17,30,0.96)_0%,_rgba(7,17,30,0.9)_100%)] px-6 py-6 shadow-[0_24px_70px_rgba(2,6,23,0.22)] lg:px-7">
      <div className="mb-5 h-px w-full bg-gradient-to-r from-cyan-400/60 via-white/10 to-transparent" />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          {icon ? (
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-cyan-200">
              {icon}
            </div>
          ) : null}

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">
              {eyebrow}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white lg:text-3xl">
              {title}
            </h1>
            {description ? (
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">{description}</p>
            ) : null}
          </div>
        </div>

        {aside ? <div className="lg:min-w-[260px] lg:pl-6">{aside}</div> : null}
      </div>
    </section>
  );
}
