"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, MessageSquare, Reply, ChevronDown, ChevronUp, Send, Loader2 } from "lucide-react";
import ModalPortal from "@/components/ModalPortal";
import Avatar from "@/components/ui/Avatar";
import MentionTextarea, { RenderMentionText, encodeMentionsForDatabase } from "@/components/ui/MentionTextarea";

type ChatUser = {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url?: string | null;
};

type ChatUpdate = {
  id: string;
  task_id: string;
  project_id: string;
  user_id: string;
  content: string;
  created_at: string;
  reply_to: string | null;
  user?: ChatUser | null;
};

type MemberUser = {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url?: string | null;
};

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  taskTitle: string;
  taskUpdates: ChatUpdate[];
  members: { user_id: string; user: MemberUser | null }[];
  profileId: string | null;
  canAddUpdate: boolean;
  canViewUpdates: boolean;
  isProjectOwnerMember: boolean;
  isSuperAdmin: boolean;
  // Handlers
  onCreateUpdate: (content: string) => Promise<void>;
  onEditUpdate: (id: string, content: string) => Promise<void>;
  onDeleteUpdate: (id: string) => void;
  onReply: (parentId: string, content: string) => Promise<void>;
  isSavingUpdate: boolean;
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ChatPanel({
  isOpen,
  onClose,
  taskTitle,
  taskUpdates,
  members,
  profileId,
  canAddUpdate,
  canViewUpdates,
  isProjectOwnerMember,
  isSuperAdmin,
  onCreateUpdate,
  onEditUpdate,
  onDeleteUpdate,
  onReply,
  isSavingUpdate,
}: ChatPanelProps) {
  const feedRef = useRef<HTMLDivElement>(null);
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [isSavingReply, setIsSavingReply] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [taskUpdates.length]);

  const memberUsers = members
    .filter((m) => m.user)
    .map((m) => m.user as MemberUser);

  const handleSend = useCallback(async () => {
    const trimmed = newMessage.trim();
    if (trimmed.length < 6 || isSending) return;
    setIsSending(true);
    try {
      const encoded = encodeMentionsForDatabase(trimmed, memberUsers);
      await onCreateUpdate(encoded);
      setNewMessage("");
    } catch {
      // keep the message on failure so user can retry
    } finally {
      setIsSending(false);
    }
  }, [newMessage, memberUsers, onCreateUpdate, isSending]);

  const handleSaveEdit = useCallback(async () => {
    if (!editingId || editingContent.trim().length === 0 || isSavingEdit) return;
    setIsSavingEdit(true);
    try {
      const encoded = encodeMentionsForDatabase(editingContent.trim(), memberUsers);
      await onEditUpdate(editingId, encoded);
      setEditingId(null);
      setEditingContent("");
    } finally {
      setIsSavingEdit(false);
    }
  }, [editingId, editingContent, memberUsers, onEditUpdate, isSavingEdit]);

  const handleSendReply = useCallback(async () => {
    if (!replyingToId || replyContent.trim().length < 2 || isSavingReply) return;
    setIsSavingReply(true);
    try {
      const encoded = encodeMentionsForDatabase(replyContent.trim(), memberUsers);
      await onReply(replyingToId, encoded);
      setReplyContent("");
      setReplyingToId(null);
    } finally {
      setIsSavingReply(false);
    }
  }, [replyingToId, replyContent, memberUsers, onReply, isSavingReply]);

  // FIX #1: Sort oldest-first (ascending by created_at)
  const topLevelUpdates = taskUpdates
    .filter((u) => !u.reply_to)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const sendDisabled = isSending || isSavingUpdate || newMessage.trim().length < 6;

  if (!isOpen) return null;

  return (
    <ModalPortal>
      {/* Transparent overlay — clicking closes both modals */}
      <div
        className="fixed inset-0 z-[9998]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Chat panel — positioned to the right */}
      <div
        className="fixed z-[10000] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200/60 overflow-hidden"
        style={{
          top: "50%",
          right: "clamp(16px, 3vw, 48px)",
          transform: "translateY(-50%)",
          width: "min(420px, calc(100vw - 540px))",
          height: "min(680px, 88vh)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-white shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-slate-900 text-white shrink-0">
              <MessageSquare size={14} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">Live Chat</p>
              <p className="text-[11px] text-slate-400 truncate">{taskTitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={16} />
          </button>
        </div>

        {/* Message feed */}
        <div ref={feedRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-0.5 min-h-0">
          {!canViewUpdates ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-slate-400">Updates visible to members only.</p>
            </div>
          ) : topLevelUpdates.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <MessageSquare size={32} className="text-slate-200" />
              <p className="text-sm text-slate-400">No messages yet</p>
              <p className="text-xs text-slate-300">Be the first to post an update</p>
            </div>
          ) : (
            topLevelUpdates.map((update) => {
              const canEdit =
                canAddUpdate &&
                (update.user_id === profileId ||
                  isProjectOwnerMember ||
                  isSuperAdmin);
              const replies = taskUpdates
                .filter((r) => r.reply_to === update.id)
                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
              const isExpanded = expandedReplies[update.id];

              return (
                <div key={update.id} className="group">
                  {/* Main message row */}
                  <div className="flex gap-2.5 py-2 px-2 rounded-lg transition hover:bg-slate-50/80">
                    <Avatar
                      userId={update.user?.id}
                      name={update.user?.name}
                      email={update.user?.email}
                      avatarUrl={update.user?.avatar_url}
                      size="sm"
                      className="mt-0.5 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[13px] font-semibold text-slate-900 truncate">
                          {update.user?.name || update.user?.email || "Unknown"}
                        </span>
                        <span className="text-[11px] text-slate-400 shrink-0">
                          {formatTime(update.created_at)}
                        </span>
                      </div>

                      {editingId === update.id ? (
                        <div className="mt-1.5 space-y-2">
                          <MentionTextarea
                            value={editingContent}
                            onChange={setEditingContent}
                            members={memberUsers}
                            placeholder="Edit your message..."
                            disabled={isSavingEdit}
                            minRows={1}
                          />
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => { setEditingId(null); setEditingContent(""); }}
                              className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-700 rounded"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleSaveEdit()}
                              disabled={isSavingEdit || editingContent.trim().length === 0}
                              className="px-2.5 py-1 text-xs font-medium text-white bg-slate-900 rounded hover:bg-slate-800 disabled:opacity-50"
                            >
                              {isSavingEdit ? "Saving..." : "Save"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-0.5 text-[13px] leading-[1.5] text-slate-700 whitespace-pre-wrap break-words">
                          <RenderMentionText text={update.content} />
                        </div>
                      )}

                      {/* Inline actions — visible on hover */}
                      {editingId !== update.id && (
                        <div className="flex items-center gap-3 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {canAddUpdate && (
                            <button
                              type="button"
                              onClick={() => {
                                setReplyingToId(replyingToId === update.id ? null : update.id);
                                setReplyContent("");
                              }}
                              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-blue-600 transition"
                            >
                              <Reply size={11} /> Reply
                            </button>
                          )}
                          {canEdit && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(update.id);
                                  setEditingContent(update.content);
                                }}
                                className="text-[11px] text-slate-400 hover:text-slate-700 transition"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteUpdate(update.id)}
                                className="text-[11px] text-slate-400 hover:text-red-500 transition"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      {/* Replies section */}
                      {replies.length > 0 && (
                        <div className="mt-1.5">
                          <button
                            onClick={() =>
                              setExpandedReplies((prev) => ({
                                ...prev,
                                [update.id]: !prev[update.id],
                              }))
                            }
                            className="flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700 transition"
                          >
                            {isExpanded ? (
                              <ChevronUp size={12} />
                            ) : (
                              <ChevronDown size={12} />
                            )}
                            {isExpanded
                              ? "Hide replies"
                              : `${replies.length} ${replies.length === 1 ? "reply" : "replies"}`}
                          </button>

                          {isExpanded && (
                            <div className="mt-1 ml-1 pl-3 border-l-2 border-slate-100 space-y-0.5">
                              {replies.map((reply) => (
                                <div
                                  key={reply.id}
                                  className="flex gap-2 py-1.5"
                                >
                                  <Avatar
                                    userId={reply.user?.id}
                                    name={reply.user?.name}
                                    email={reply.user?.email}
                                    avatarUrl={reply.user?.avatar_url}
                                    size="xs"
                                    className="mt-0.5 shrink-0"
                                  />
                                  <div className="min-w-0">
                                    <div className="flex items-baseline gap-1.5">
                                      <span className="text-xs font-semibold text-slate-800">
                                        {reply.user?.name ||
                                          reply.user?.email ||
                                          "Unknown"}
                                      </span>
                                      <span className="text-[10px] text-slate-400">
                                        {formatTime(reply.created_at)}
                                      </span>
                                    </div>
                                    <div className="text-xs leading-[1.5] text-slate-600 whitespace-pre-wrap break-words">
                                      <RenderMentionText
                                        text={reply.content}
                                      />
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Reply composer */}
                      {replyingToId === update.id && (
                        <div className="mt-2 ml-1 pl-3 border-l-2 border-blue-200">
                          <MentionTextarea
                            value={replyContent}
                            onChange={setReplyContent}
                            members={memberUsers}
                            placeholder="Write a reply..."
                            disabled={isSavingReply}
                            minRows={1}
                            onSubmit={() => void handleSendReply()}
                          />
                          <div className="mt-1.5 flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setReplyingToId(null);
                                setReplyContent("");
                              }}
                              className="px-2 py-1 text-[11px] text-slate-400 hover:text-slate-600 rounded"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={
                                isSavingReply ||
                                replyContent.trim().length < 2
                              }
                              onClick={() => void handleSendReply()}
                              className="px-2.5 py-1 text-[11px] font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
                            >
                              {isSavingReply ? "Sending..." : "Reply"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Composer — pinned to bottom */}
        {canAddUpdate && (
          <div className="border-t border-slate-100 bg-white px-4 py-3 shrink-0">
            <div className="flex items-end gap-2.5">
              <div className="flex-1 min-w-0">
                <MentionTextarea
                  value={newMessage}
                  onChange={setNewMessage}
                  members={memberUsers}
                  placeholder="Type a message… (Enter to send)"
                  disabled={isSending || isSavingUpdate}
                  minRows={1}
                  maxLength={500}
                  onSubmit={() => void handleSend()}
                  className="!border-slate-200 !rounded-xl !py-2 !text-[13px]"
                />
              </div>
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={sendDisabled}
                className="flex items-center justify-center h-9 w-9 rounded-xl bg-slate-900 text-white shrink-0 transition-all hover:bg-slate-800 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed mb-[22px]"
              >
                {isSending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </ModalPortal>
  );
}
