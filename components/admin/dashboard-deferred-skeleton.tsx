export function DashboardDeferredSkeleton() {
  return (
    <div className="space-y-4" aria-label="Carregando modulos do dashboard">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_380px]">
        <SkeletonPanel rows={4} />
        <div className="space-y-4">
          <SkeletonPanel rows={5} />
          <SkeletonPanel rows={3} />
        </div>
      </section>
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <SkeletonPanel rows={4} />
        <SkeletonPanel rows={4} />
      </section>
    </div>
  );
}

function SkeletonPanel({ rows }: { rows: number }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
      <div className="h-5 w-44 rounded-full bg-slate-100" />
      <div className="mt-5 space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="h-4 w-2/3 rounded-full bg-slate-200" />
            <div className="mt-3 h-3 w-full rounded-full bg-slate-100" />
            <div className="mt-2 h-3 w-4/5 rounded-full bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
