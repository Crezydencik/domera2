const skeletonCards = ["readings", "company", "activity", "documents"];

export default function AppLoading() {
  return (
    <main className="w-full p-4 sm:p-6 lg:p-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div className="space-y-3">
          <div className="h-5 w-32 animate-pulse rounded bg-slate-200" />
          <div className="h-8 w-56 animate-pulse rounded bg-slate-200" />
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {skeletonCards.map((card) => (
            <section key={card} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
              <div className="mt-5 h-7 w-20 animate-pulse rounded bg-slate-200" />
              <div className="mt-4 h-3 w-full animate-pulse rounded bg-slate-100" />
              <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-slate-100" />
            </section>
          ))}
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="h-5 w-40 animate-pulse rounded bg-slate-200" />
          <div className="mt-5 space-y-3">
            <div className="h-10 w-full animate-pulse rounded bg-slate-100" />
            <div className="h-10 w-full animate-pulse rounded bg-slate-100" />
            <div className="h-10 w-3/4 animate-pulse rounded bg-slate-100" />
          </div>
        </section>
      </div>
    </main>
  );
}
