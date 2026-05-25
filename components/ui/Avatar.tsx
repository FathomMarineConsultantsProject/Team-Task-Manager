"use client";

import { useMemo } from "react";

// 12 curated colors for deterministic avatar backgrounds
const AVATAR_COLORS = [
  "bg-rose-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-cyan-500",
  "bg-sky-500",
  "bg-blue-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-purple-500",
  "bg-pink-500",
];

const SIZE_CLASSES: Record<string, { container: string; text: string; img: string }> = {
  xs: { container: "h-6 w-6", text: "text-[9px]", img: "h-6 w-6" },
  sm: { container: "h-8 w-8", text: "text-[10px]", img: "h-8 w-8" },
  md: { container: "h-10 w-10", text: "text-xs", img: "h-10 w-10" },
  lg: { container: "h-11 w-11", text: "text-sm", img: "h-11 w-11" },
  xl: { container: "h-16 w-16", text: "text-lg", img: "h-16 w-16" },
  "2xl": { container: "h-24 w-24", text: "text-2xl", img: "h-24 w-24" },
};

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

function getInitials(name?: string | null, email?: string | null): string {
  const trimmed = name?.trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/).filter(Boolean).slice(0, 2);
    if (parts.length > 0) {
      return parts.map(p => p.charAt(0).toUpperCase()).join("");
    }
  }
  const prefix = email?.split("@")[0]?.replace(/[^a-zA-Z0-9]/g, "") ?? "";
  if (prefix.length >= 2) return prefix.slice(0, 2).toUpperCase();
  return prefix.toUpperCase() || "--";
}

interface AvatarProps {
  userId?: string;
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
  onClick?: () => void;
}

export default function Avatar({
  userId,
  name,
  email,
  avatarUrl,
  size = "md",
  className = "",
  onClick,
}: AvatarProps) {
  const initials = useMemo(() => getInitials(name, email), [name, email]);
  const colorClass = useMemo(() => {
    const seed = userId ?? name ?? email ?? "default";
    return AVATAR_COLORS[hashCode(seed) % AVATAR_COLORS.length];
  }, [userId, name, email]);

  const sizeConfig = SIZE_CLASSES[size] ?? SIZE_CLASSES.md;
  const interactive = onClick ? "cursor-pointer hover:ring-2 hover:ring-slate-300 hover:ring-offset-1 transition-all" : "";

  if (avatarUrl) {
    return (
      <div
        className={`${sizeConfig.container} overflow-hidden rounded-full ${interactive} ${className}`}
        onClick={onClick}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      >
        <img
          src={avatarUrl}
          alt={name ?? email ?? "User avatar"}
          className={`${sizeConfig.img} rounded-full object-cover`}
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div
      className={`${sizeConfig.container} flex items-center justify-center rounded-full ${colorClass} ${sizeConfig.text} font-semibold text-white select-none ${interactive} ${className}`}
      title={name ?? email ?? undefined}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
    >
      {initials}
    </div>
  );
}

export { AVATAR_COLORS, getInitials, hashCode };
