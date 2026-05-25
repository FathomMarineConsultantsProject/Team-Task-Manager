"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Avatar from "@/components/ui/Avatar";

type MemberUser = {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url?: string | null;
};

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  members: MemberUser[];
  placeholder?: string;
  disabled?: boolean;
  minRows?: number;
  maxLength?: number;
  className?: string;
  onSubmit?: () => void;
}

export default function MentionTextarea({
  value,
  onChange,
  members,
  placeholder = "Write a comment...",
  disabled = false,
  minRows = 2,
  maxLength = 500,
  className = "",
  onSubmit,
}: MentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredMembers = useMemo(() => {
    if (!mentionQuery) return members.slice(0, 8);
    const q = mentionQuery.toLowerCase();
    return members
      .filter(m => {
        const name = m.name?.toLowerCase() ?? "";
        const email = m.email?.toLowerCase() ?? "";
        return name.includes(q) || email.includes(q);
      })
      .slice(0, 8);
  }, [members, mentionQuery]);

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      onChange(newValue);

      const cursorPos = e.target.selectionStart ?? newValue.length;
      const textBeforeCursor = newValue.slice(0, cursorPos);

      // Check for @ trigger — look for the last @ that isn't part of a completed mention
      const lastAtIndex = textBeforeCursor.lastIndexOf("@");

      if (lastAtIndex >= 0) {
        const charBefore = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : " ";
        const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);

        // Only trigger if @ is at start or after whitespace, and text after doesn't contain ]( (completed mention)
        if (
          (charBefore === " " || charBefore === "\n" || lastAtIndex === 0) &&
          !textAfterAt.includes("](") &&
          !textAfterAt.includes("\n")
        ) {
          setMentionStartIndex(lastAtIndex);
          setMentionQuery(textAfterAt);
          setShowDropdown(true);
          setSelectedIndex(0);
          return;
        }
      }

      setShowDropdown(false);
      setMentionQuery("");
      setMentionStartIndex(-1);
    },
    [onChange],
  );

  const insertMention = useCallback(
    (member: MemberUser) => {
      const displayName = member.name ?? member.email ?? "Unknown";
      // Insert clean mention in the textarea, no brackets or UUIDs
      const mentionText = `@${displayName} `;

      const beforeMention = value.slice(0, mentionStartIndex);
      const cursorPos = textareaRef.current?.selectionStart ?? value.length;
      const afterCursor = value.slice(cursorPos);

      const newValue = beforeMention + mentionText + afterCursor;
      onChange(newValue);

      setShowDropdown(false);
      setMentionQuery("");
      setMentionStartIndex(-1);

      // Focus textarea and move cursor after mention
      setTimeout(() => {
        if (textareaRef.current) {
          const newCursorPos = beforeMention.length + mentionText.length;
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
    },
    [mentionStartIndex, onChange, value],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (showDropdown && filteredMembers.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex(prev => (prev + 1) % filteredMembers.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex(prev => (prev - 1 + filteredMembers.length) % filteredMembers.length);
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          insertMention(filteredMembers[selectedIndex]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setShowDropdown(false);
          return;
        }
      }

      // Enter = send, Shift+Enter = new line
      if (e.key === "Enter" && !e.shiftKey && onSubmit) {
        e.preventDefault();
        onSubmit();
        return;
      }
    },
    [showDropdown, filteredMembers, selectedIndex, insertMention, onSubmit],
  );

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;
    const handleClick = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showDropdown]);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
        rows={minRows}
        className={`w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none disabled:opacity-50 ${className}`}
      />

      {/* Mention autocomplete dropdown */}
      {showDropdown && filteredMembers.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute bottom-full left-0 z-50 mb-1 w-full max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl"
        >
          {filteredMembers.map((member, idx) => (
            <button
              key={member.id}
              type="button"
              onClick={() => insertMention(member)}
              onMouseEnter={() => setSelectedIndex(idx)}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition ${
                idx === selectedIndex ? "bg-slate-100" : "hover:bg-slate-50"
              }`}
            >
              <Avatar
                userId={member.id}
                name={member.name}
                email={member.email}
                avatarUrl={member.avatar_url}
                size="xs"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-900">
                  {member.name ?? member.email ?? "Unknown"}
                </p>
                {member.name && member.email && (
                  <p className="truncate text-xs text-slate-400">{member.email}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Hint */}
      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
        <span>Type @ to mention a team member</span>
        <span>{value.length}/{maxLength}</span>
      </div>
    </div>
  );
}

/**
 * Render comment text with mentions highlighted.
 * Mention format: @[Display Name](userId)
 */
export function RenderMentionText({ text, className = "" }: { text: string; className?: string }) {
  const parts = useMemo(() => {
    const regex = /@\[([^\]]+)\]\(([0-9a-f-]{36})\)/g;
    const result: { type: "text" | "mention"; value: string; userId?: string }[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        result.push({ type: "text", value: text.slice(lastIndex, match.index) });
      }
      result.push({ type: "mention", value: match[1], userId: match[2] });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      result.push({ type: "text", value: text.slice(lastIndex) });
    }

    return result;
  }, [text]);

  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.type === "mention" ? (
          <span
            key={i}
            className="inline-flex items-center rounded bg-blue-100 px-1 py-0.5 text-xs font-semibold text-blue-700"
            title={part.userId}
          >
            @{part.value}
          </span>
        ) : (
          <span key={i}>{part.value}</span>
        ),
      )}
    </span>
  );
}

/**
 * Encodes clean @Name mentions into the raw database format @[Name](userId)
 */
export function encodeMentionsForDatabase(text: string, members: { id: string; name: string | null; email: string | null }[]): string {
  if (!text.includes("@")) return text;
  
  let result = text;
  // Sort members by name length (longest first) to prevent partial matches
  const sortedMembers = [...members]
    .filter(m => m.name || m.email)
    .sort((a, b) => {
      const aName = a.name ?? a.email ?? "";
      const bName = b.name ?? b.email ?? "";
      return bName.length - aName.length;
    });

  for (const m of sortedMembers) {
    const displayName = m.name ?? m.email ?? "";
    if (!displayName) continue;
    
    // Replace @Name with @[Name](id), but ensure we don't replace already encoded ones
    // We use a regex that matches @Name but not @[Name]
    const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`@${escapeRegExp(displayName)}(?![\\]\\)])`, 'gi');
    result = result.replace(regex, `@[${displayName}](${m.id})`);
  }
  
  return result;
}
