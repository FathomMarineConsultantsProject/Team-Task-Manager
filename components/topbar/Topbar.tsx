'use client';
import { LogOut } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import Button from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import { useAppData } from "@/components/providers/AppDataProvider";

export default function Topbar() {
  const { authUser, profile, logout } = useAppData();

  const displayName = profile?.name ?? authUser?.email ?? "User";
  const displayRole = profile?.job_role ?? "";

  const initials = useMemo(() => {
    if (!profile?.name && !profile?.email) {
      return "--";
    }
    const source = profile?.name ?? profile?.email ?? "";
    const segments = source.trim().split(/\s+/).slice(0, 2);
    return segments.map((segment) => (segment[0]?.toUpperCase() ?? "")).join("") || "--";
  }, [profile?.email, profile?.name]);

  const role = (profile?.system_role ?? "").toLowerCase();
  const isAdmin = role.includes("admin");

  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    role: "user",
    job_role: "",
  });

  const [createdUserCreds, setCreatedUserCreds] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const resetForm = useCallback(() => {
    setNewUser({ name: "", email: "", role: "user", job_role: "" });
  }, []);

  const handleCreateUser = useCallback(async () => {
    if (!newUser.name.trim() || !newUser.email.trim()) {
      alert("Name and email are required.");
      return;
    }

    setIsCreating(true);
    try {
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });

      const data = await res.json();

      if (data.error) {
        alert(data.error);
        return;
      }

      setCreatedUserCreds({
        email: data.email,
        password: data.password,
      });
      setIsCreateUserOpen(false);
      resetForm();
    } catch (err) {
      console.error("Failed to create user", err);
      alert("Failed to create user. Please try again.");
    } finally {
      setIsCreating(false);
    }
  }, [newUser, resetForm]);

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-8 py-4">
        <div className="flex flex-1" />
        <div className="ml-6 flex items-center gap-4">

          {/* NAME + ROLE */}
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-900">{displayName}</p>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              {displayRole}
            </p>
          </div>

          {/* CREATE USER BUTTON */}
          {isAdmin && (
            <Button
              type="button"
              onClick={() => setIsCreateUserOpen(true)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em]"
            >
              + Create User
            </Button>
          )}

          {/* LOGOUT BUTTON */}
          <Button
            type="button"
            variant="ghost"
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em]"
            onClick={logout}
          >
            <LogOut size={14} />
            Logout
          </Button>

          {/* AVATAR */}
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700">
            {initials}
          </div>

        </div>
      </header>

      {/* CREATE USER MODAL */}
      <Modal title="Create User" isOpen={isCreateUserOpen} onClose={() => { setIsCreateUserOpen(false); resetForm(); }}>
        <div className="space-y-4">
          <div>
            <label htmlFor="create-user-name" className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
              Name
            </label>
            <input
              id="create-user-name"
              type="text"
              placeholder="e.g., Krish Sriram"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
              value={newUser.name}
              onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              disabled={isCreating}
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="create-user-email" className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
              Email
            </label>
            <input
              id="create-user-email"
              type="email"
              placeholder="e.g., krish@fmc.com"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
              value={newUser.email}
              onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              disabled={isCreating}
            />
          </div>

          <div>
            <label htmlFor="create-user-job-role" className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
              Job Role
            </label>
            <input
              id="create-user-job-role"
              type="text"
              placeholder="e.g., Software Engineer"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
              value={newUser.job_role}
              onChange={(e) => setNewUser({ ...newUser, job_role: e.target.value })}
              disabled={isCreating}
            />
          </div>

          <div>
            <label htmlFor="create-user-role" className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
              System Role
            </label>
            <select
              id="create-user-role"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
              value={newUser.role}
              onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
              disabled={isCreating}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => { setIsCreateUserOpen(false); resetForm(); }}
              disabled={isCreating}
              className="rounded-lg px-4 py-2 text-sm font-semibold"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleCreateUser()}
              disabled={isCreating || !newUser.name.trim() || !newUser.email.trim()}
              className="rounded-lg px-4 py-2 text-sm font-semibold"
            >
              {isCreating ? "Creating..." : "Create"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* SUCCESS CREDENTIALS MODAL */}
      <Modal
        title="User Created"
        isOpen={!!createdUserCreds}
        onClose={() => setCreatedUserCreds(null)}
      >
        {createdUserCreds && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Copy and share these credentials:
            </p>

            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs text-slate-500">Email</p>
              <div className="flex justify-between items-center">
                <p className="text-sm font-medium">{createdUserCreds.email}</p>
                <button
                  onClick={() => navigator.clipboard.writeText(createdUserCreds.email)}
                  className="text-xs text-blue-600 hover:text-blue-800 transition"
                >
                  Copy
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs text-slate-500">Password</p>
              <div className="flex justify-between items-center">
                <p className="text-sm font-medium">{createdUserCreds.password}</p>
                <button
                  onClick={() => navigator.clipboard.writeText(createdUserCreds.password)}
                  className="text-xs text-blue-600 hover:text-blue-800 transition"
                >
                  Copy
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (!createdUserCreds) return;
                    const text = `Email: ${createdUserCreds.email}\nPassword: ${createdUserCreds.password}`;
                    navigator.clipboard.writeText(text);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  className="text-xs font-semibold text-blue-600 hover:underline"
                >
                  Copy All
                </button>
                {copied && (
                  <p className="text-xs text-green-600">Copied!</p>
                )}
              </div>
              <Button onClick={() => setCreatedUserCreds(null)}>
                Done
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
