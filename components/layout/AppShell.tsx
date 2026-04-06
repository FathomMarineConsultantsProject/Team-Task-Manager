"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "@/components/sidebar/Sidebar";
import Topbar from "@/components/topbar/Topbar";
import { useAppData } from "@/components/providers/AppDataProvider";

const LOGIN_ROUTE = "/login";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { profile, isAuthLoading } = useAppData();
  const isLoginRoute = pathname === LOGIN_ROUTE;
  const routerRef = useRef(router);
  routerRef.current = router;
  const isLoggedIn = Boolean(profile?.id);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    if (!isLoggedIn && !isLoginRoute) {
      routerRef.current?.replace(LOGIN_ROUTE);
    } else if (isLoggedIn && isLoginRoute) {
      routerRef.current?.replace("/dashboard");
    }
  }, [isAuthLoading, isLoggedIn, isLoginRoute]);

  if (isAuthLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm font-medium text-slate-500">Loading workspace…</p>
      </div>
    );
  }

  if (isLoginRoute) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
        {children}
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm font-medium text-slate-500">Redirecting to login…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-hidden bg-white text-slate-900">
      <Sidebar />
      <div className="ml-[260px] flex h-screen flex-col overflow-hidden bg-white">
        <Topbar />
        <main className="flex-1 overflow-y-auto bg-white p-8">{children}</main>
      </div>
    </div>
  );
}
