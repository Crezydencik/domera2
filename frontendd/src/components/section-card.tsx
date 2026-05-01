import type { ReactNode } from "react";

interface SectionCardProps {
  title?: string;
  titleMeta?: ReactNode;
  description?: string;
  titleAside?: ReactNode;
  titleAsidePlacement?: "inline" | "below";
  headerAside?: ReactNode;
  children: ReactNode;
}

export function SectionCard({
  title,
  titleMeta,
  description,
  titleAside,
  titleAsidePlacement = "inline",
  headerAside,
  children,
}: SectionCardProps) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            {title ? <h2 className="text-lg font-semibold text-slate-900">{title}</h2> : null}
            {titleMeta ? <div className="min-w-0">{titleMeta}</div> : null}
            {titleAside && titleAsidePlacement === "inline" ? <div className="min-w-0 flex-1">{titleAside}</div> : null}
          </div>
          {description ? <p className="text-sm text-slate-500">{description}</p> : null}
          {titleAside && titleAsidePlacement === "below" ? <div className="mt-2 min-w-0">{titleAside}</div> : null}
        </div>
        {headerAside ? <div className="shrink-0">{headerAside}</div> : null}
      </div>
      {children}
    </section>
  );
}
