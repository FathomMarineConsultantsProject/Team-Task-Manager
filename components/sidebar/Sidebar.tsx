'use client';
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ListChecks, Map, Table2, Users } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";

const navLinks = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Backlog", href: "/backlog", icon: ListChecks },
  { label: "Roadmap", href: "/roadmap", icon: Map },
  { label: "Spreadsheet", href: "/spreadsheet", icon: Table2 },
];

const linkBaseClass = "flex items-center justify-between rounded-2xl px-3 py-2 text-sm font-medium transition";

export default function Sidebar() {
  const pathname = usePathname() || "/dashboard";
  const isProjectRoute = pathname.startsWith("/project/");
  const { profile } = useAppData();
  const isAdmin = (profile?.system_role ?? profile?.role ?? "").toLowerCase() === "admin";
  const links = [
    ...navLinks,
    ...(isAdmin ? [{ label: "Employees", href: "/dashboard/employees", icon: Users }] : []),
  ];

  return (
    <aside className="fixed left-0 top-0 flex h-screen w-[260px] flex-col bg-[#0f172a] px-5 py-6 text-sm text-slate-200">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-lg font-semibold">
          TT
        </div>
        <div>
          <p className="text-base font-semibold text-white">Team Task Manager</p>
          <p className="text-xs text-slate-400">Signed in as {profile?.name ?? "--"}</p>
        </div>
      </div>

      <nav className="mt-10 flex flex-col gap-2">
        {links.map((link) => {
          const Icon = link.icon;
          const isDashboardLike = link.href === "/dashboard" && (pathname === "/dashboard" || isProjectRoute);
          const active = link.href !== "/dashboard" ? pathname.startsWith(link.href) : isDashboardLike;
          const navClass = [
            linkBaseClass,
            active ? "bg-white/90 text-slate-900" : "text-slate-300 hover:bg-white/5",
          ].join(" ");
          return (
            <Link key={link.href} href={link.href} className={navClass}>
              <span className="flex items-center gap-3">
                <Icon size={16} />
                {link.label}
              </span>
              {active && <span className="h-2 w-2 rounded-full bg-emerald-400" />}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-slate-200">
        <p className="text-[11px] uppercase tracking-[0.4em] text-slate-400">Workspace</p>
        <p className="mt-2 text-base font-semibold text-white">{profile?.role === "admin" ? "Admin Access" : "Member Access"}</p>
        <p className="mt-1 text-slate-400">Use the dashboard to create and manage projects.</p>
      </div>
    </aside>
  );
}
