"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import Sidebar from "@/components/sidebar/Sidebar";
import Topbar from "@/components/topbar/Topbar";
import AiAssistantPanel from "@/components/ai/AiAssistantPanel";
import { useAppData } from "@/components/providers/AppDataProvider";

const LOGIN_ROUTE = "/login";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { profile, supabase, isAuthLoading } = useAppData();
  const isLoginRoute = pathname === LOGIN_ROUTE;
  const routerRef = useRef(router);
  routerRef.current = router;
  const isLoggedIn = Boolean(profile?.id);
  const [isAiOpen, setIsAiOpen] = useState(false);

  // Extract project ID from URL if on a project board
  const projectId = useMemo(() => {
    // Match /dashboard/projects/:id or /project/:id/board
    const dashMatch = pathname.match(/\/dashboard\/projects\/([^/]+)/);
    if (dashMatch) return dashMatch[1];
    const boardMatch = pathname.match(/\/project\/([^/]+)\/board/);
    if (boardMatch) return boardMatch[1];
    return null;
  }, [pathname]);

  // Load project context for AI
  const [aiContext, setAiContext] = useState<{
    projectName?: string;
    projectId?: string;
    currentUser?: {
      id: string;
      name: string | null;
      email: string | null;
      role: string | null;
    };
    members?: { name: string; id: string }[];
    tasks?: {
      title: string;
      status: string;
      id: string;
      description?: string | null;
      end_date?: string | null;
      assigned_to?: string | null;
    }[];
  } | undefined>(undefined);

  const loadAiContext = useCallback(async () => {
    if (!projectId || !supabase) {
      setAiContext(undefined);
      return;
    }

    try {
      const [projectRes, membersRes, tasksRes] = await Promise.all([
        supabase.from("projects").select("id, name").eq("id", projectId).single(),
        supabase
          .from("project_members")
          .select("user_id, user:users(id, name, email)")
          .eq("project_id", projectId),
        supabase
          .from("tasks")
          .select("id, title, status, description, end_date, assigned_to")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      const projectName = (projectRes.data as { name: string } | null)?.name ?? "Unknown";
      const memberRows = (membersRes.data ?? []) as unknown as {
        user_id: string;
        user: { id: string; name: string | null; email: string | null } | { id: string; name: string | null; email: string | null }[] | null;
      }[];
      const taskRows = (tasksRes.data ?? []) as {
        id: string;
        title: string | null;
        status: string | null;
        description?: string | null;
        end_date?: string | null;
        assigned_to?: string | null;
      }[];

      setAiContext({
        projectId,
        projectName,
        currentUser: profile
          ? {
              id: profile.id,
              name: profile.name,
              email: profile.email,
              role: profile.job_role ?? profile.system_role ?? profile.role,
            }
          : undefined,
        members: memberRows
          .filter(m => m.user)
          .map(m => {
            const user = Array.isArray(m.user) ? m.user[0] : m.user;
            return {
              name: user?.name ?? user?.email ?? "Unknown",
              id: user?.id ?? m.user_id,
            };
          }),
        tasks: taskRows.map(t => ({
          id: t.id,
          title: t.title ?? "Untitled",
          status: t.status ?? "todo",
          description: t.description ?? null,
          end_date: t.end_date ?? null,
          assigned_to: t.assigned_to ?? null,
        })),
      });
    } catch (err) {
      console.error("Failed to load AI context", err);
      setAiContext(undefined);
    }
  }, [profile, projectId, supabase]);

  useEffect(() => {
    void loadAiContext();
  }, [loadAiContext]);

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
      <div className={`ml-[260px] flex h-screen flex-col overflow-hidden bg-white transition-all ${isAiOpen ? "mr-[420px]" : ""}`}>
        <Topbar />
        <main className="flex-1 overflow-y-auto bg-white p-8">{children}</main>
      </div>

      {/* AI Panel */}
      <AiAssistantPanel
        isOpen={isAiOpen}
        onClose={() => setIsAiOpen(false)}
        context={aiContext}
        onTaskCreated={(payload) => {
          void loadAiContext();

          if (payload?.projectId) {
            window.dispatchEvent(
              new CustomEvent("ai-task-created", {
                detail: payload,
              }),
            );
          }
        }}
        onCommentAdded={() => void loadAiContext()}
        onTaskUpdated={() => void loadAiContext()}
      />

      {/* AI Toggle Floating Button — Black */}
      {!isAiOpen && (
        <button
          type="button"
          onClick={() => setIsAiOpen(true)}
          className="fixed bottom-6 right-6 z-[9990] flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-xl transition-all hover:scale-105 hover:bg-slate-800 hover:shadow-2xl active:scale-95"
          aria-label="Open AI Assistant"
        >
          <Sparkles size={22} />
        </button>
      )}
    </div>
  );
}
