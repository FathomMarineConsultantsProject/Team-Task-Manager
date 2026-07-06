"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type SupabaseClient = {
  auth?: { getSession: () => Promise<{ data: { session: { access_token: string } | null } }> };
};

type ReviewApproval = {
  id: string;
  reviewerId: string;
  reviewerName: string;
  status: "pending" | "reviewed" | string;
  reviewedAt: string | null;
};

type ReviewApprovalsResponse = {
  reviews?: ReviewApproval[];
  currentUserReviewerId?: string | null;
  reviewedCount?: number;
  totalCount?: number;
  error?: string;
};

type TaskReviewApprovalsProps = {
  supabase: SupabaseClient;
  taskId: string;
  projectId: string;
  currentUserId: string | null;
  taskStatus: string;
  onCountsChange?: (counts: { reviewedCount: number; totalCount: number }) => void;
  onReviewCompleted?: () => void | Promise<void>;
};

const formatReviewedAt = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

async function getAccessToken(supabase: SupabaseClient) {
  if (!supabase.auth) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export default function TaskReviewApprovals({
  supabase,
  taskId,
  projectId,
  currentUserId,
  taskStatus,
  onCountsChange,
  onReviewCompleted,
}: TaskReviewApprovalsProps) {
  const [reviews, setReviews] = useState<ReviewApproval[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReviews = useCallback(async () => {
    if (!taskId || !projectId) {
      setReviews([]);
      onCountsChange?.({ reviewedCount: 0, totalCount: 0 });
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const accessToken = await getAccessToken(supabase);
      if (!accessToken) {
        setReviews([]);
        onCountsChange?.({ reviewedCount: 0, totalCount: 0 });
        setError("Please sign in again to view review approvals.");
        return;
      }

      const response = await fetch(`/api/tasks/${taskId}/review-approvals`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const result = (await response.json()) as ReviewApprovalsResponse;

      if (!response.ok) {
        throw new Error(result.error ?? "Failed to load review approvals.");
      }

      const nextReviews = result.reviews ?? [];
      setReviews(nextReviews);
      onCountsChange?.({
        reviewedCount: result.reviewedCount ?? nextReviews.filter((review) => review.status === "reviewed").length,
        totalCount: result.totalCount ?? nextReviews.length,
      });
    } catch (err) {
      setReviews([]);
      onCountsChange?.({ reviewedCount: 0, totalCount: 0 });
      setError(err instanceof Error ? err.message : "Failed to load review approvals.");
    } finally {
      setLoading(false);
    }
  }, [onCountsChange, projectId, supabase, taskId]);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews, taskStatus]);

  const currentUserReview = useMemo(
    () => reviews.find((review) => review.reviewerId === currentUserId) ?? null,
    [currentUserId, reviews],
  );

  const canMarkReviewed = taskStatus === "in_review" && currentUserReview?.status === "pending";

  const markReviewed = async () => {
    if (!canMarkReviewed || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const accessToken = await getAccessToken(supabase);
      if (!accessToken) {
        setError("Please sign in again to mark your review complete.");
        return;
      }

      const response = await fetch(`/api/tasks/${taskId}/review-approvals/mark-reviewed`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "Failed to mark review complete.");
      }

      await loadReviews();
      await onReviewCompleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark review complete.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">Loading review approvals...</div>;
  }

  if (reviews.length === 0 && !error) {
    return <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">No reviewers required for this review cycle.</div>;
  }

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}
      <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {reviews.map((review) => {
          const isReviewed = review.status === "reviewed";
          const isCurrentUserReview = review.reviewerId === currentUserId;
          return (
            <div key={review.id} className="flex items-center justify-between gap-3 px-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{review.reviewerName}</p>
                <p className={`mt-0.5 text-xs ${isReviewed ? "text-emerald-700" : "text-amber-700"}`}>
                  {isReviewed ? "Reviewed" : "Pending Review"}
                </p>
                {isReviewed && review.reviewedAt ? (
                  <p className="mt-0.5 text-xs text-slate-500">Reviewed {formatReviewedAt(review.reviewedAt)}</p>
                ) : null}
              </div>
              {isCurrentUserReview && review.status === "pending" && taskStatus === "in_review" ? (
                <button
                  type="button"
                  onClick={() => void markReviewed()}
                  disabled={submitting}
                  className="shrink-0 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                >
                  {submitting ? "Saving..." : "Mark as Reviewed"}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
