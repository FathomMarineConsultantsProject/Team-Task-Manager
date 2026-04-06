'use client';
import { LogOut } from "lucide-react";
import { useMemo } from "react";
import Button from "@/components/ui/button";
import { useAppData } from "@/components/providers/AppDataProvider";

export default function Topbar() {
  const { authUser, profile, logout } = useAppData();

  const displayName = profile?.name ?? authUser?.email ?? "User";
  const displayRole = profile?.job_role ?? "";

  const initials = useMemo(() => {
    if (!profile?.name && !profile?.email) {
      return "--";
    }
    const source = profile?.name ?? profile?.email ?? "";
    const segments = source.trim().split(/\s+/).slice(0, 2);
    return segments.map((segment) => (segment[0]?.toUpperCase() ?? "")).join("") || "--";
  }, [profile?.email, profile?.name]);

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-8 py-4">
      <div className="flex flex-1" />
      <div className="ml-6 flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-semibold text-slate-900">{displayName}</p>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">{displayRole}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700">
          {initials}
        </div>
        <Button
          type="button"
          variant="ghost"
          className="gap-2 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-600"
          onClick={logout}
        >
          <LogOut size={14} />
          Logout
        </Button>
      </div>
    </header>
  );
}
