"use client";

import { useEffect } from "react";

export default function BoardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Project board render failed", error);
  }, [error]);

  return (
    <div className="mx-auto mt-12 max-w-xl rounded-lg border border-red-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-slate-900">The project board could not be displayed</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Reload the board state and try the action again. Tasks already saved to the project are preserved.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 rounded-md border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
      >
        Reload board
      </button>
    </div>
  );
}
