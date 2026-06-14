"use client";

import { useCallback, useRef, useState } from "react";
import {
  Paperclip,
  Plus,
  Trash2,
  FileText,
  FileSpreadsheet,
  FileImage,
  File,
  AlertCircle,
} from "lucide-react";

// -------------------------------------------------------------------
// Constants (shared with TaskAttachments)
// -------------------------------------------------------------------

const ALLOWED_EXTENSIONS = [
  ".pdf", ".doc", ".docx",
  ".xls", ".xlsx", ".csv",
  ".ppt", ".pptx",
  ".png", ".jpg", ".jpeg", ".webp",
  ".txt",
];

const ALLOWED_MIME_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "text/csv": ".csv",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "text/plain": ".txt",
};

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIconByName(name: string) {
  const ext = ("." + (name.split(".").pop()?.toLowerCase() ?? "")).toLowerCase();
  if (ext === ".pdf")
    return <FileText size={14} className="text-red-500" />;
  if ([".doc", ".docx"].includes(ext))
    return <FileText size={14} className="text-blue-500" />;
  if ([".xls", ".xlsx", ".csv"].includes(ext))
    return <FileSpreadsheet size={14} className="text-emerald-500" />;
  if ([".ppt", ".pptx"].includes(ext))
    return <FileText size={14} className="text-orange-500" />;
  if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext))
    return <FileImage size={14} className="text-violet-500" />;
  if (ext === ".txt")
    return <FileText size={14} className="text-slate-500" />;
  return <File size={14} className="text-slate-400" />;
}

function isAllowedFile(file: File): boolean {
  if (ALLOWED_MIME_TYPES[file.type]) return true;
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext);
}

// -------------------------------------------------------------------
// Exported types
// -------------------------------------------------------------------

export type PendingAttachment = {
  id: string; // client-side unique ID
  file: File;
  name: string;
  size: number;
};

// -------------------------------------------------------------------
// Component
// -------------------------------------------------------------------

interface CreateTaskAttachmentsProps {
  pendingFiles: PendingAttachment[];
  onFilesChange: (files: PendingAttachment[]) => void;
  disabled?: boolean;
}

export default function CreateTaskAttachments({
  pendingFiles,
  onFilesChange,
  disabled = false,
}: CreateTaskAttachmentsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files;
      e.target.value = ""; // Reset so same file can be re-selected
      if (!selected || selected.length === 0) return;

      setError(null);
      const rejected: string[] = [];
      const accepted: PendingAttachment[] = [];

      for (let i = 0; i < selected.length; i++) {
        const file = selected[i];
        if (!isAllowedFile(file)) {
          rejected.push(`${file.name} (unsupported type)`);
          continue;
        }
        if (file.size > MAX_FILE_SIZE) {
          rejected.push(`${file.name} (exceeds 25 MB)`);
          continue;
        }
        // Prevent duplicates by name
        const alreadyAdded =
          pendingFiles.some((p) => p.name === file.name) ||
          accepted.some((p) => p.name === file.name);
        if (alreadyAdded) {
          rejected.push(`${file.name} (already added)`);
          continue;
        }

        accepted.push({
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${i}`,
          file,
          name: file.name,
          size: file.size,
        });
      }

      if (accepted.length > 0) {
        onFilesChange([...pendingFiles, ...accepted]);
      }

      if (rejected.length > 0) {
        setError(`Skipped: ${rejected.join(", ")}`);
      }
    },
    [pendingFiles, onFilesChange],
  );

  const handleRemove = useCallback(
    (id: string) => {
      onFilesChange(pendingFiles.filter((f) => f.id !== id));
    },
    [pendingFiles, onFilesChange],
  );

  return (
    <div className="space-y-2.5">
      {/* Section header */}
      <div className="flex items-center gap-1.5">
        <Paperclip size={12} className="text-slate-400" />
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
          Attachments
        </p>
        {pendingFiles.length > 0 && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
            {pendingFiles.length}
          </span>
        )}
      </div>

      {/* File list */}
      {pendingFiles.length > 0 && (
        <div className="space-y-1.5">
          {pendingFiles.map((pf) => (
            <div
              key={pf.id}
              className="group flex items-center gap-2.5 rounded-xl border border-slate-100 bg-white px-3 py-2 transition hover:border-slate-200 hover:shadow-sm"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50">
                {getFileIconByName(pf.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-800" title={pf.name}>
                  {pf.name}
                </p>
                <p className="text-[10px] text-slate-400">
                  {formatFileSize(pf.size)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(pf.id)}
                disabled={disabled}
                title="Remove"
                className="rounded-lg p-1 text-slate-300 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add files button */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
        className={`flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-3 transition-all cursor-pointer ${
          disabled
            ? "border-slate-200 bg-slate-50/40 opacity-60 pointer-events-none"
            : "border-slate-200 bg-slate-50/40 hover:border-slate-300 hover:bg-slate-50"
        }`}
      >
        <Plus size={14} className="text-slate-400" />
        <span className="text-xs text-slate-500">Add Files</span>
        <span className="text-[10px] text-slate-400">— Max 25 MB per file</span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ALLOWED_EXTENSIONS.join(",")}
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
