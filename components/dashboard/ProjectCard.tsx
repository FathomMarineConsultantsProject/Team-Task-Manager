"use client";

import { KeyboardEvent, MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Trash2, Users } from "lucide-react";

interface ProjectCardProps {
  projectId: string;
  projectName: string;
  ownerName: string | null;
  ownerId: string;
  memberCount: number;
  currentUserId: string | null;
  isSuperAdmin: boolean;
  onDelete?: (projectId: string) => Promise<void> | void;
}

export default function ProjectCard({
  projectId,
  projectName,
  ownerName,
  ownerId,
  memberCount,
  currentUserId,
  isSuperAdmin,
  onDelete,
}: ProjectCardProps) {
  const router = useRouter();
  const canDelete = Boolean(onDelete && currentUserId && (ownerId === currentUserId || isSuperAdmin));

  const handleNavigate = () => {
    router.push(`/dashboard/projects/${projectId}`);
  };

  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleNavigate();
    }
  };

  const handleDeleteClick = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!canDelete || !onDelete) {
      return;
    }

    const confirmed = window.confirm("Are you sure you want to delete this project?");
    if (!confirmed) {
      return;
    }

    try {
      await onDelete(projectId);
    } catch (error) {
      console.error("Failed to delete project", error);
      alert("Unable to delete project. Please try again.");
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleNavigate}
      onKeyDown={handleCardKeyDown}
      className="group flex w-full flex-col rounded-3xl border border-slate-200 bg-white/80 p-6 text-left shadow-sm transition hover:-translate-y-1 hover:border-slate-300 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Project</p>
          <h3 className="mt-2 text-xl font-semibold text-slate-900">{projectName}</h3>
        </div>
        <div className="flex items-center gap-2">
          {canDelete ? (
            <button
              type="button"
              aria-label="Delete project"
              onClick={handleDeleteClick}
              className="rounded-full border border-red-100 bg-red-50 p-2 text-red-500 transition hover:bg-red-100"
            >
              <Trash2 size={16} />
            </button>
          ) : null}
          <div className="rounded-2xl bg-slate-900/5 p-3 text-slate-600">
            <ArrowRight size={18} className="transition group-hover:translate-x-1" />
          </div>
        </div>
      </div>
      <div className="mt-6 space-y-3 text-sm text-slate-600">
        <p>
          <span className="font-semibold text-slate-900">Owner:</span> {ownerName ?? "Unknown"}
        </p>
        <p className="flex items-center gap-2">
          <Users size={16} className="text-slate-400" />
          <span className="font-semibold text-slate-900">{memberCount}</span> members
        </p>
      </div>
      <div className="mt-6 text-xs font-semibold uppercase tracking-[0.4em] text-emerald-600">
        Open Board
      </div>
    </div>
  );
}
