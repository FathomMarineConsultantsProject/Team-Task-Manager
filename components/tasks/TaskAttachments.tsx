"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Download,
  Loader2,
  Paperclip,
  Trash2,
  Upload,
  FileText,
  FileSpreadsheet,
  FileImage,
  File,
} from "lucide-react";

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

type AttachmentRow = {
  id: string;
  task_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  uploaded_by: string;
  created_at: string;
};

/** Enriched attachment with resolved uploader name */
type EnrichedAttachment = AttachmentRow & {
  uploaderName: string | null;
};

type SupabaseClient = {
  from: (table: string) => any;
  storage: {
    from: (bucket: string) => any;
  };
};

interface TaskAttachmentsProps {
  supabase: SupabaseClient;
  taskId: string;
  profileId: string | null;
  /** Whether the current user can upload files to this task */
  canUpload?: boolean;
  /** Whether the current user can delete any attachment (project owner/lead) */
  canDeleteAll?: boolean;
}

// -------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------

const BUCKET = "task-attachments";

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

const ALLOWED_EXTENSIONS = [
  ".pdf", ".doc", ".docx",
  ".xls", ".xlsx", ".csv",
  ".ppt", ".pptx",
  ".png", ".jpg", ".jpeg", ".webp",
  ".txt",
];

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "Just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getFileIcon(mime: string) {
  if (mime === "application/pdf")
    return <FileText size={16} className="text-red-500" />;
  if (mime.includes("word") || mime === "application/msword")
    return <FileText size={16} className="text-blue-500" />;
  if (mime.includes("spreadsheet") || mime.includes("excel") || mime === "text/csv")
    return <FileSpreadsheet size={16} className="text-emerald-500" />;
  if (mime.includes("presentation") || mime.includes("powerpoint"))
    return <FileText size={16} className="text-orange-500" />;
  if (mime.startsWith("image/"))
    return <FileImage size={16} className="text-violet-500" />;
  if (mime === "text/plain")
    return <FileText size={16} className="text-slate-500" />;
  return <File size={16} className="text-slate-400" />;
}

function isAllowedFile(file: File): boolean {
  if (ALLOWED_MIME_TYPES[file.type]) return true;
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext);
}

// -------------------------------------------------------------------
// Component
// -------------------------------------------------------------------

export default function TaskAttachments({
  supabase,
  taskId,
  profileId,
  canUpload = true,
  canDeleteAll = false,
}: TaskAttachmentsProps) {
  const [attachments, setAttachments] = useState<EnrichedAttachment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- Load attachments + uploader names ----
  const loadAttachments = useCallback(async () => {
    if (!taskId) return;
    setIsLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from("task_attachments")
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false });

      if (fetchError) {
        console.error("Failed to load attachments:", fetchError);
        setAttachments([]);
        return;
      }

      const rows = (data as AttachmentRow[] | null) ?? [];

      // Resolve uploader names
      const uploaderIds = [...new Set(rows.map((r) => r.uploaded_by).filter(Boolean))];
      let uploaderMap: Record<string, string> = {};

      if (uploaderIds.length > 0) {
        try {
          const { data: usersData } = await supabase
            .from("users")
            .select("id, name, email")
            .in("id", uploaderIds);

          const users = (usersData as { id: string; name: string | null; email: string | null }[] | null) ?? [];
          uploaderMap = Object.fromEntries(
            users.map((u) => [u.id, u.name || u.email || "Unknown"]),
          );
        } catch {
          // Fail silently — names will show as null
        }
      }

      setAttachments(
        rows.map((row) => ({
          ...row,
          uploaderName: uploaderMap[row.uploaded_by] ?? null,
        })),
      );
    } catch {
      setAttachments([]);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, taskId]);

  useEffect(() => {
    void loadAttachments();
  }, [loadAttachments]);

  // ---- Upload ----
  const handleUpload = useCallback(
    async (file: File) => {
      if (!profileId) {
        setError("You must be logged in to upload files.");
        return;
      }

      if (!isAllowedFile(file)) {
        setError(`File type not supported. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`);
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        setError("File size exceeds 25 MB limit.");
        return;
      }

      setIsUploading(true);
      setError(null);
      setUploadProgress(`Uploading ${file.name}…`);

      try {
        // Build unique storage path: taskId/timestamp_sanitizedFilename
        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `${taskId}/${timestamp}_${safeName}`;

        // Upload to Supabase Storage (same pattern as avatar upload in ProfileModal)
        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, file, {
            upsert: false,
            contentType: file.type || "application/octet-stream",
          });

        if (uploadError) {
          setError(uploadError.message ?? "Upload failed.");
          return;
        }

        // Save metadata to task_attachments table
        const { error: insertError } = await supabase
          .from("task_attachments")
          .insert({
            task_id: taskId,
            file_name: file.name,
            storage_path: storagePath,
            mime_type: file.type || "application/octet-stream",
            file_size: file.size,
            uploaded_by: profileId,
          });

        if (insertError) {
          // Rollback: remove uploaded file from storage
          await supabase.storage.from(BUCKET).remove([storagePath]);
          setError(insertError.message ?? "Failed to save attachment metadata.");
          return;
        }

        await loadAttachments();
      } catch {
        setError("Upload failed. Please try again.");
      } finally {
        setIsUploading(false);
        setUploadProgress(null);
      }
    },
    [supabase, taskId, profileId, loadAttachments],
  );

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (file) await handleUpload(file);
    },
    [handleUpload],
  );

  // ---- Download (fetch blob → immediate file save) ----
  const handleDownload = useCallback(
    async (attachment: AttachmentRow) => {
      setDownloadingId(attachment.id);
      setError(null);
      try {
        // 1. Generate a short-lived signed URL (never shown to user)
        const { data, error: signError } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(attachment.storage_path, 60);

        if (signError || !data?.signedUrl) {
          console.error("[Attachment Download] Signed URL generation failed:", signError);
          setError("Failed to generate download link.");
          return;
        }

        // 2. Fetch file as blob so the browser never navigates to the URL
        const response = await fetch(data.signedUrl);
        if (!response.ok) {
          console.error("[Attachment Download] Fetch failed:", response.status, response.statusText);
          setError("Download failed — file may have been removed.");
          return;
        }

        const blob = await response.blob();

        // 3. Create object URL and trigger immediate download
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = attachment.file_name; // Original filename preserved
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();

        // 4. Cleanup
        document.body.removeChild(a);
        URL.revokeObjectURL(objectUrl);
      } catch (err) {
        console.error("[Attachment Download] Unexpected error:", err);
        setError("Download failed.");
      } finally {
        setDownloadingId(null);
      }
    },
    [supabase],
  );

  // ---- Delete (atomic: storage + DB with logging) ----
  const handleDelete = useCallback(
    async (attachment: AttachmentRow) => {
      setDeletingId(attachment.id);
      setError(null);
      try {
        // Step 1: Delete from storage
        const { error: storageError } = await supabase.storage
          .from(BUCKET)
          .remove([attachment.storage_path]);

        if (storageError) {
          console.error("[Attachment Delete] Storage delete FAILED:", {
            attachmentId: attachment.id,
            storagePath: attachment.storage_path,
            error: storageError,
          });
          setError("Failed to delete file from storage. Please try again.");
          setDeletingId(null);
          return;
        }

        console.log("[Attachment Delete] Storage delete OK:", attachment.storage_path);

        // Step 2: Delete metadata row
        const { error: dbError } = await supabase
          .from("task_attachments")
          .delete()
          .eq("id", attachment.id);

        if (dbError) {
          console.error("[Attachment Delete] DB delete FAILED (file already removed from storage):", {
            attachmentId: attachment.id,
            error: dbError,
          });
          setError("File removed from storage but failed to delete record. Refreshing list.");
          // Refresh from server to get accurate state
          await loadAttachments();
          return;
        }

        console.log("[Attachment Delete] DB delete OK:", attachment.id);

        // Step 3: Remove from UI immediately (no full reload needed)
        setAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
      } catch (err) {
        console.error("[Attachment Delete] Unexpected error:", err);
        setError("Delete failed. Refreshing list.");
        await loadAttachments();
      } finally {
        setDeletingId(null);
      }
    },
    [supabase, loadAttachments],
  );

  // ---- Permission helpers ----
  // Can delete: project owner/lead (canDeleteAll) OR the uploader of this specific attachment
  const canDeleteAttachment = (att: AttachmentRow): boolean => {
    if (canDeleteAll) return true;
    if (profileId && att.uploaded_by === profileId) return true;
    return false;
  };

  // ---- Render ----
  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 flex items-center gap-1.5">
          <Paperclip size={12} />
          Attachments
          {attachments.length > 0 && (
            <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
              {attachments.length}
            </span>
          )}
        </p>
      </div>

      {/* Upload button — only shown if user has upload permission */}
      {canUpload && (
        <>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className={`flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-3.5 transition-all cursor-pointer ${
              isUploading
                ? "border-slate-200 bg-slate-50/40 opacity-60 pointer-events-none"
                : "border-slate-200 bg-slate-50/40 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            {isUploading ? (
              <>
                <Loader2 size={16} className="animate-spin text-slate-400" />
                <span className="text-xs text-slate-500">{uploadProgress ?? "Uploading…"}</span>
              </>
            ) : (
              <>
                <Upload size={16} className="text-slate-400" />
                <span className="text-xs text-slate-500">Click to upload file</span>
                <span className="text-[10px] text-slate-400">— Max 25 MB</span>
              </>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_EXTENSIONS.join(",")}
            onChange={(e) => void handleFileChange(e)}
            className="hidden"
          />
        </>
      )}

      {/* Error message */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
          {error}
        </div>
      )}

      {/* Attachments list */}
      {isLoading ? (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
          <Loader2 size={14} className="animate-spin" />
          Loading attachments…
        </div>
      ) : attachments.length > 0 ? (
        <div className="space-y-1.5">
          {attachments.map((att) => {
            const showDelete = canDeleteAttachment(att);
            return (
              <div
                key={att.id}
                className="group flex items-start gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2.5 transition hover:border-slate-200 hover:shadow-sm"
              >
                {/* File icon */}
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 mt-0.5">
                  {getFileIcon(att.mime_type)}
                </div>

                {/* File info */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800" title={att.file_name}>
                    {att.file_name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400 leading-relaxed">
                    {att.uploaderName ? (
                      <>
                        <span className="text-slate-500">Uploaded by {att.uploaderName}</span>
                        <span className="mx-1">·</span>
                      </>
                    ) : null}
                    {timeAgo(att.created_at)}
                    <span className="mx-1">·</span>
                    {formatFileSize(att.file_size)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
                  {/* Download — always visible to all project members */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDownload(att);
                    }}
                    disabled={downloadingId === att.id}
                    title="Download"
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
                  >
                    {downloadingId === att.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Download size={14} />
                    )}
                  </button>
                  {/* Delete — only if permitted (owner/lead or original uploader) */}
                  {showDelete && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDelete(att);
                      }}
                      disabled={deletingId === att.id}
                      title="Delete"
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                    >
                      {deletingId === att.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
