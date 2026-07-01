import { AuthCard } from "@/components/auth/auth-ui";

export default function AppLoading() {
  return (
    <AuthCard>
      <div className="space-y-5">
        <div className="h-4 w-36 animate-pulse rounded-full bg-slate-200" />
        <div className="space-y-3">
          <div className="h-8 w-64 animate-pulse rounded bg-slate-200" />
          <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
        </div>
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
          <div className="mt-3 h-4 w-2/3 animate-pulse rounded bg-slate-200" />
        </div>
      </div>
    </AuthCard>
  );
}
