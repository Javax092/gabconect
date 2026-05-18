function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-2xl bg-slate-200/80 ${className}`} />;
}

export default function AdminLoading() {
  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-slate-200 bg-white px-6 py-6 shadow-soft">
        <SkeletonBlock className="mb-5 h-1.5 w-28" />
        <SkeletonBlock className="h-3 w-28" />
        <SkeletonBlock className="mt-4 h-8 w-72 max-w-full" />
        <SkeletonBlock className="mt-4 h-4 w-full max-w-3xl" />
        <SkeletonBlock className="mt-2 h-4 w-5/6 max-w-2xl" />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-soft"
          >
            <div className="flex items-center justify-between">
              <SkeletonBlock className="h-4 w-28" />
              <SkeletonBlock className="h-11 w-11 rounded-2xl" />
            </div>
            <SkeletonBlock className="mt-8 h-10 w-20" />
          </div>
        ))}
      </section>

      <section className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-soft">
        <SkeletonBlock className="h-5 w-48" />
        <div className="mt-6 space-y-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
              <SkeletonBlock className="h-5 w-56 max-w-full" />
              <SkeletonBlock className="mt-3 h-4 w-full" />
              <SkeletonBlock className="mt-2 h-4 w-4/5" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
