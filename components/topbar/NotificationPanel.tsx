"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Check, CheckCheck, MessageSquare, AtSign, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAppData } from "@/components/providers/AppDataProvider";
import Avatar from "@/components/ui/Avatar";
import { RenderMentionText } from "@/components/ui/MentionTextarea";

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  project_id: string | null;
  task_id: string | null;
  actor_id: string | null;
  is_read: boolean;
  created_at: string;
  actor?: {
    id: string;
    name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
};

const ICON_MAP: Record<string, typeof MessageSquare> = {
  comment: MessageSquare,
  mention: AtSign,
  assigned: UserPlus,
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

export default function NotificationPanel() {
  const { supabase, profile } = useAppData();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFetchRef = useRef(0);
  const inflightRef = useRef(false);
  const failureCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchNotifications = useCallback(async (force = false) => {
    if (!profile?.id) return;
    if (inflightRef.current) return;

    const now = Date.now();
    if (!force && now - lastFetchRef.current < 5000) return;

    try {
      inflightRef.current = true;
      setIsLoading(true);
      const { data, error } = await supabase
        .from("notifications")
        .select("id, type, title, body, project_id, task_id, actor_id, is_read, created_at")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) {
        console.error("Failed to fetch notifications", error);
        return;
      }

      const rows = (data ?? []) as NotificationRow[];

      // Fetch actor info
      const actorIds = Array.from(new Set(rows.map(r => r.actor_id).filter(Boolean))) as string[];
      let actorsById: Record<string, { id: string; name: string | null; email: string | null; avatar_url: string | null }> = {};

      if (actorIds.length > 0) {
        const { data: actorsData } = await supabase
          .from("users")
          .select("id, name, email, avatar_url")
          .in("id", actorIds);

        if (actorsData) {
          actorsById = (actorsData as typeof actorsById[string][]).reduce((acc, u) => {
            acc[u.id] = u;
            return acc;
          }, {} as typeof actorsById);
        }
      }

      const enriched = rows.map(row => ({
        ...row,
        actor: row.actor_id ? actorsById[row.actor_id] ?? null : null,
      }));

      setNotifications(enriched);
      setUnreadCount(enriched.filter(n => !n.is_read).length);
      lastFetchRef.current = now;
      failureCountRef.current = 0;
    } catch (err) {
      console.error("Notification fetch error", err);
      failureCountRef.current += 1;

      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }

      const delay = Math.min(15000, 5000 * failureCountRef.current);
      retryTimerRef.current = setTimeout(() => {
        void fetchNotifications(true);
      }, delay);
    } finally {
      inflightRef.current = false;
      setIsLoading(false);
    }
  }, [profile?.id, supabase]);

  // Fetch on mount and poll every 30s
  useEffect(() => {
    if (!profile?.id) return;

    void fetchNotifications(true);
    const interval = setInterval(() => void fetchNotifications(), 30_000);
    return () => clearInterval(interval);
  }, [fetchNotifications, profile?.id]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchNotifications(true);
      }
    };

    const handleOnline = () => {
      void fetchNotifications(true);
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, [fetchNotifications]);

  // Close panel on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const markAsRead = useCallback(async (notifId: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", notifId);
    setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, [supabase]);

  const markAllAsRead = useCallback(async () => {
    if (!profile?.id) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", profile.id).eq("is_read", false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, [profile?.id, supabase]);

  const handleNotificationClick = useCallback(async (notif: NotificationRow) => {
    if (!notif.is_read) {
      void markAsRead(notif.id);
    }

    // Navigate to project board — the task detail will be accessible there
    if (notif.project_id) {
      const url = notif.task_id
        ? `/dashboard/projects/${notif.project_id}?taskId=${notif.task_id}`
        : `/dashboard/projects/${notif.project_id}`;
      router.push(url);
    }

    setIsOpen(false);
  }, [markAsRead, router]);

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => { setIsOpen(prev => !prev); if (!isOpen) void fetchNotifications(true); }}
        className="relative rounded-xl border border-slate-200 p-2.5 text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
        aria-label="Notifications"
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[400px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
              {unreadCount > 0 && (
                <p className="mt-0.5 text-xs text-slate-500">{unreadCount} unread</p>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllAsRead()}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
              >
                <CheckCheck size={13} />
                Mark all read
              </button>
            )}
          </div>

          {/* Notification List */}
          <div className="max-h-[420px] overflow-y-auto">
            {isLoading && notifications.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-sm text-slate-400">
                Loading…
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate-400">
                <Bell size={24} />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              notifications.map(notif => {
                const TypeIcon = ICON_MAP[notif.type] ?? MessageSquare;
                return (
                  <button
                    key={notif.id}
                    type="button"
                    onClick={() => void handleNotificationClick(notif)}
                    className={`flex w-full items-start gap-3 border-b border-slate-50 px-5 py-3.5 text-left transition hover:bg-slate-50 ${
                      !notif.is_read ? "bg-blue-50/40" : ""
                    }`}
                  >
                    {/* Actor avatar */}
                    <div className="relative shrink-0">
                      <Avatar
                        userId={notif.actor?.id}
                        name={notif.actor?.name}
                        email={notif.actor?.email}
                        avatarUrl={notif.actor?.avatar_url}
                        size="sm"
                      />
                      <div className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-slate-100">
                        <TypeIcon size={9} className="text-slate-500" />
                      </div>
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm leading-snug ${!notif.is_read ? "font-semibold text-slate-900" : "text-slate-700"}`}>
                        {notif.title}
                      </p>
                      {notif.body && (
                        <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                          <RenderMentionText text={notif.body} />
                        </div>
                      )}
                      <p className="mt-1 text-[11px] text-slate-400">
                        {timeAgo(notif.created_at)}
                      </p>
                    </div>

                    {/* Unread indicator */}
                    {!notif.is_read && (
                      <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
