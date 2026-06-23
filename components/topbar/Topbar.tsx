"use client";

import { LogOut, MoreHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import Avatar from "@/components/ui/Avatar";
import NotificationPanel from "@/components/topbar/NotificationPanel";
import ProfileModal from "@/components/topbar/ProfileModal";
import { useAppData } from "@/components/providers/AppDataProvider";

type ManagedUser = {
  id: string;
  name: string | null;
  email: string | null;
  job_role: string | null;
  system_role: string | null;
  avatar_url: string | null;
  created_at?: string | null;
};

type ManageUsersTab = "employees" | "create";
type SystemRole = "user" | "admin";

const SYSTEM_ROLE_OPTIONS: SystemRole[] = ["user", "admin"];

type DeleteImpact = {
  ownershipTransfers: {
    projectId: string;
    projectName: string | null;
    newOwnerId: string;
    newOwnerName: string | null;
    newOwnerEmail: string | null;
  }[];
  projectsToArchive: {
    projectId: string;
    projectName: string | null;
  }[];
};

const emptyNewUser = {
  name: "",
  email: "",
  role: "user",
  job_role: "",
};

export default function Topbar() {
  const { authUser, profile, logout, supabase } = useAppData();

  const displayName = profile?.name ?? authUser?.email ?? "User";
  const displayRole = profile?.job_role ?? "";
  const currentUserId = profile?.id ?? authUser?.id ?? null;

  const normalizedSystemRole = (profile?.system_role ?? "").toLowerCase();
  const isAdmin = normalizedSystemRole === "admin";

  const [isManageUsersOpen, setIsManageUsersOpen] = useState(false);
  const [manageUsersTab, setManageUsersTab] = useState<ManageUsersTab>("employees");
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    job_role: "",
    system_role: "user" as SystemRole,
  });
  const [newUser, setNewUser] = useState(emptyNewUser);
  const [createdUserCreds, setCreatedUserCreds] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const [deleteUserTarget, setDeleteUserTarget] = useState<ManagedUser | null>(null);
  const [deleteImpact, setDeleteImpact] = useState<DeleteImpact | null>(null);
  const [loadingDeleteImpact, setLoadingDeleteImpact] = useState(false);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [userActionLoadingId, setUserActionLoadingId] = useState<string | null>(null);
  const [openActionUserId, setOpenActionUserId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [manageUsersError, setManageUsersError] = useState<string | null>(null);
  const [manageUsersSuccess, setManageUsersSuccess] = useState<string | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const resetForm = useCallback(() => {
    setNewUser(emptyNewUser);
  }, []);

  const getAccessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, [supabase]);

  const fetchWithAuth = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("Please sign in again.");
      }

      return fetch(url, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          Authorization: `Bearer ${accessToken}`,
        },
      });
    },
    [getAccessToken],
  );

  const copyToClipboard = useCallback((text: string | null | undefined, label: string) => {
    if (!text) return;
    void navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }, []);

  const loadManagedUsers = useCallback(async () => {
    if (!isAdmin) return;

    setLoadingUsers(true);
    setManageUsersError(null);
    setManageUsersSuccess(null);

    try {
      const res = await fetchWithAuth("/api/admin/users");
      const data = (await res.json()) as { users?: ManagedUser[]; error?: string };

      if (!res.ok || data.error) {
        throw new Error(data.error ?? "Failed to load users.");
      }

      setManagedUsers(data.users ?? []);
    } catch (error) {
      console.error("Failed to load managed users", error);
      setManageUsersError(error instanceof Error ? error.message : "Failed to load users.");
      setManagedUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }, [fetchWithAuth, isAdmin]);

  useEffect(() => {
    if (!isManageUsersOpen) return;
    void loadManagedUsers();
  }, [isManageUsersOpen, loadManagedUsers]);

  const filteredUsers = useMemo(() => {
    const search = userSearch.trim().toLowerCase();
    if (!search) return managedUsers;

    return managedUsers.filter((user) => {
      const name = user.name?.toLowerCase() ?? "";
      const email = user.email?.toLowerCase() ?? "";
      const jobRole = user.job_role?.toLowerCase() ?? "";
      const systemRole = user.system_role?.toLowerCase() ?? "";
      return name.includes(search) || email.includes(search) || jobRole.includes(search) || systemRole.includes(search);
    });
  }, [managedUsers, userSearch]);

  const closeManageUsers = useCallback(() => {
    setIsManageUsersOpen(false);
    setManageUsersTab("employees");
    setUserSearch("");
    setEditingUser(null);
    setDeleteUserTarget(null);
    setDeleteImpact(null);
    setLoadingDeleteImpact(false);
    setOpenActionUserId(null);
    setManageUsersError(null);
    setManageUsersSuccess(null);
    resetForm();
  }, [resetForm]);

  const handleCreateUser = useCallback(async () => {
    if (!newUser.name.trim() || !newUser.email.trim()) {
      alert("Name and email are required.");
      return;
    }

    setIsCreating(true);
    setManageUsersError(null);
    setManageUsersSuccess(null);

    try {
      const res = await fetchWithAuth("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });
      const data = (await res.json()) as { email?: string; password?: string; error?: string };

      if (!res.ok || data.error) {
        throw new Error(data.error ?? "Failed to create user.");
      }

      setCreatedUserCreds({
        email: data.email ?? newUser.email,
        password: data.password ?? "",
      });
      resetForm();
      await loadManagedUsers();
    } catch (err) {
      console.error("Failed to create user", err);
      setManageUsersError(err instanceof Error ? err.message : "Failed to create user.");
    } finally {
      setIsCreating(false);
    }
  }, [fetchWithAuth, loadManagedUsers, newUser, resetForm]);

  const startEditingUser = useCallback((user: ManagedUser) => {
    setEditingUser(user);
    setEditForm({
      name: user.name ?? "",
      email: user.email ?? "",
      job_role: user.job_role ?? "",
      system_role: (SYSTEM_ROLE_OPTIONS.includes(user.system_role as SystemRole) ? user.system_role : "user") as SystemRole,
    });
    setOpenActionUserId(null);
    setManageUsersError(null);
    setManageUsersSuccess(null);
  }, []);

  const handleSaveUser = useCallback(async () => {
    if (!editingUser) return;

    setUserActionLoadingId(`${editingUser.id}:edit`);
    setManageUsersError(null);
    setManageUsersSuccess(null);

    try {
      const payload: {
        name: string;
        email: string;
        job_role: string;
        system_role?: SystemRole;
      } = {
        name: editForm.name,
        email: editForm.email,
        job_role: editForm.job_role,
      };

      payload.system_role = editForm.system_role;

      const res = await fetchWithAuth(`/api/admin/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { user?: ManagedUser; error?: string };

      if (!res.ok || data.error || !data.user) {
        throw new Error(data.error ?? "Failed to update user.");
      }

      setManagedUsers((current) => current.map((user) => (user.id === data.user?.id ? { ...user, ...data.user } : user)));
      setEditingUser(null);
      setManageUsersSuccess("User details updated.");
    } catch (error) {
      console.error("Failed to update user", error);
      setManageUsersError(error instanceof Error ? error.message : "Failed to update user.");
    } finally {
      setUserActionLoadingId(null);
    }
  }, [editForm, editingUser, fetchWithAuth]);

  const closeDeleteUserModal = useCallback(() => {
    if (isDeletingUser) return;
    setDeleteUserTarget(null);
    setDeleteImpact(null);
    setLoadingDeleteImpact(false);
  }, [isDeletingUser]);

  const openDeleteUserModal = useCallback(
    async (managedUser: ManagedUser) => {
      setOpenActionUserId(null);
      setDeleteUserTarget(managedUser);
      setDeleteImpact(null);
      setLoadingDeleteImpact(true);
      setManageUsersError(null);
      setManageUsersSuccess(null);

      try {
        const res = await fetchWithAuth(`/api/admin/users/${managedUser.id}/delete-impact`);
        const data = (await res.json()) as DeleteImpact & { error?: string };

        if (!res.ok || data.error) {
          throw new Error(data.error ?? "Failed to load delete impact.");
        }

        setDeleteImpact({
          ownershipTransfers: data.ownershipTransfers ?? [],
          projectsToArchive: data.projectsToArchive ?? [],
        });
      } catch (error) {
        console.error("Failed to load delete impact", error);
        setManageUsersError(error instanceof Error ? error.message : "Failed to load delete impact.");
      } finally {
        setLoadingDeleteImpact(false);
      }
    },
    [fetchWithAuth],
  );

  const handleDeleteUser = useCallback(async () => {
    if (!deleteUserTarget) return;

    setIsDeletingUser(true);
    setManageUsersError(null);
    setManageUsersSuccess(null);

    try {
      const res = await fetchWithAuth(`/api/admin/users/${deleteUserTarget.id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        ownershipTransferred?: unknown[];
        projectsArchived?: unknown[];
      };

      if (!res.ok || data.error) {
        throw new Error(data.error ?? "Failed to delete user.");
      }

      const transferredCount = data.ownershipTransferred?.length ?? 0;
      const archivedCount = data.projectsArchived?.length ?? 0;
      setManagedUsers((current) => current.filter((user) => user.id !== deleteUserTarget.id));
      setEditingUser((current) => (current?.id === deleteUserTarget.id ? null : current));
      setDeleteUserTarget(null);
      setDeleteImpact(null);
      setManageUsersSuccess(
        `${deleteUserTarget.name || deleteUserTarget.email || "User"} deleted. Projects transferred: ${transferredCount}. Projects archived: ${archivedCount}.`,
      );
    } catch (error) {
      console.error("Failed to delete user", error);
      setManageUsersError(error instanceof Error ? error.message : "Failed to delete user.");
    } finally {
      setIsDeletingUser(false);
    }
  }, [deleteUserTarget, fetchWithAuth]);

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-8 py-4">
        <div className="flex flex-1" />
        <div className="ml-6 flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-900">{displayName}</p>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">{displayRole}</p>
          </div>

          {isAdmin && (
            <Button
              type="button"
              onClick={() => {
                setManageUsersTab("employees");
                setIsManageUsersOpen(true);
              }}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em]"
            >
              Manage Users
            </Button>
          )}

          <NotificationPanel />

          <Button
            type="button"
            variant="ghost"
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em]"
            onClick={logout}
          >
            <LogOut size={14} />
            Logout
          </Button>

          <Avatar
            userId={profile?.id}
            name={profile?.name}
            email={profile?.email}
            avatarUrl={profile?.avatar_url}
            size="lg"
            onClick={() => setIsProfileOpen(true)}
          />
        </div>
      </header>

      <ProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />

      <Modal title="Manage Users" isOpen={isManageUsersOpen} onClose={closeManageUsers} maxWidth="max-w-6xl">
        <div className="space-y-5 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
              {(["employees", "create"] as ManageUsersTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setManageUsersTab(tab)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] transition ${
                    manageUsersTab === tab ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-white hover:text-slate-900"
                  }`}
                >
                  {tab === "employees" ? "Employees" : "Create User"}
                </button>
              ))}
            </div>
            {copied ? <p className="text-xs font-semibold text-emerald-600">{copied} copied</p> : null}
          </div>

          {manageUsersError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{manageUsersError}</div>
          ) : null}

          {manageUsersSuccess ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{manageUsersSuccess}</div>
          ) : null}

          {manageUsersTab === "employees" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <input
                  type="text"
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  placeholder="Search employees..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none sm:max-w-sm"
                />
                <Button type="button" variant="outline" onClick={() => void loadManagedUsers()} disabled={loadingUsers}>
                  {loadingUsers ? "Refreshing..." : "Refresh"}
                </Button>
              </div>

              {editingUser ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Name</label>
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Email</label>
                      <input
                        type="email"
                        value={editForm.email}
                        onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Job Role</label>
                      <input
                        type="text"
                        value={editForm.job_role}
                        onChange={(event) => setEditForm((current) => ({ ...current, job_role: event.target.value }))}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">System Role</label>
                      <select
                        value={editForm.system_role}
                        onChange={(event) => setEditForm((current) => ({ ...current, system_role: event.target.value as SystemRole }))}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                      >
                        {SYSTEM_ROLE_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end gap-3">
                    <Button type="button" variant="ghost" onClick={() => setEditingUser(null)}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void handleSaveUser()}
                      disabled={userActionLoadingId === `${editingUser.id}:edit`}
                    >
                      {userActionLoadingId === `${editingUser.id}:edit` ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="relative min-h-[280px] overflow-visible rounded-xl border border-slate-200">
                <div className="grid grid-cols-[1.3fr_1.4fr_1fr_0.8fr_112px] gap-3 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  <span>Name</span>
                  <span>Email</span>
                  <span>Job Role</span>
                  <span>System Role</span>
                  <span className="whitespace-nowrap text-right">ACTIONS</span>
                </div>
                <div className="min-h-[240px] overflow-visible bg-white">
                  {loadingUsers ? (
                    <div className="px-4 py-8 text-center text-sm text-slate-500">Loading users...</div>
                  ) : filteredUsers.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-slate-500">No users found.</div>
                  ) : (
                    filteredUsers.map((managedUser) => {
                      const canDeleteManagedUser = isAdmin && managedUser.id !== currentUserId;

                      return (
                        <div
                          key={managedUser.id}
                          className="grid grid-cols-[1.3fr_1.4fr_1fr_0.8fr_112px] items-center gap-3 border-t border-slate-100 px-4 py-3 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900">{managedUser.name ?? "Unnamed user"}</p>
                          </div>
                          <p className="truncate text-slate-600">{managedUser.email ?? "No email"}</p>
                          <p className="truncate text-slate-600">{managedUser.job_role || "Not set"}</p>
                          <p className="truncate text-slate-600">{managedUser.system_role || "user"}</p>
                          <div className="relative flex w-28 justify-end justify-self-end text-right">
                            <button
                              type="button"
                              aria-label={`Actions for ${managedUser.name ?? managedUser.email ?? "user"}`}
                              onClick={() => setOpenActionUserId((current) => (current === managedUser.id ? null : managedUser.id))}
                              className="rounded-md p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                            >
                              <MoreHorizontal size={16} />
                            </button>
                            {openActionUserId === managedUser.id ? (
                              <div
                                className={`absolute right-0 z-50 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg ${
                                  filteredUsers.length <= 2 ? "bottom-full mb-2" : "top-full mt-2"
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    copyToClipboard(managedUser.email ?? "", "Email");
                                    setOpenActionUserId(null);
                                  }}
                                  className="block w-full px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                                >
                                  Copy email
                                </button>
                                <button
                                  type="button"
                                  onClick={() => startEditingUser(managedUser)}
                                  className="block w-full px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                                >
                                  Edit details
                                </button>
                                {canDeleteManagedUser ? (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void openDeleteUserModal(managedUser);
                                    }}
                                    className="block w-full border-t border-slate-100 px-3 py-2 text-left text-xs font-semibold text-red-600 hover:bg-red-50"
                                  >
                                    Delete Profile
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
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
                    onChange={(event) => setNewUser({ ...newUser, name: event.target.value })}
                    disabled={isCreating}
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
                    onChange={(event) => setNewUser({ ...newUser, email: event.target.value })}
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
                    onChange={(event) => setNewUser({ ...newUser, job_role: event.target.value })}
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
                    onChange={(event) => setNewUser({ ...newUser, role: event.target.value })}
                    disabled={isCreating}
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <Button type="button" variant="ghost" onClick={resetForm} disabled={isCreating}>
                    Clear
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void handleCreateUser()}
                    disabled={isCreating || !newUser.name.trim() || !newUser.email.trim()}
                  >
                    {isCreating ? "Creating..." : "Create"}
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Generated Credentials</p>
                {createdUserCreds ? (
                  <div className="mt-4 space-y-3">
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="text-xs text-slate-500">Email</p>
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-medium text-slate-900">{createdUserCreds.email}</p>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(createdUserCreds.email, "Email")}
                          className="text-xs font-semibold text-blue-600 hover:underline"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="text-xs text-slate-500">Password</p>
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-medium text-slate-900">{createdUserCreds.password}</p>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(createdUserCreds.password, "Password")}
                          className="text-xs font-semibold text-blue-600 hover:underline"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => copyToClipboard(`Email: ${createdUserCreds.email}\nPassword: ${createdUserCreds.password}`, "Credentials")}
                      className="w-full"
                    >
                      Copy All
                    </Button>
                  </div>
                ) : (
                  <p className="mt-4 text-sm leading-6 text-slate-500">
                    Credentials appear here after a user is created. Passwords are not stored after this session.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal title="Delete User" isOpen={Boolean(deleteUserTarget)} onClose={closeDeleteUserModal} maxWidth="max-w-xl">
        {deleteUserTarget ? (
          <div className="space-y-5 pb-4">
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-900">This action permanently deletes the user from the app.</p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-red-800">
                <li>Deletes their login account</li>
                <li>Removes them from all projects</li>
                <li>Unassigns their tasks</li>
                <li>Transfers owned projects to the next available project member</li>
                <li>Archives projects that have no other members</li>
              </ul>
            </div>

            <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Name</p>
                <p className="mt-1 font-semibold text-slate-900">{deleteUserTarget.name || "Unnamed user"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Email</p>
                <p className="mt-1 break-all text-slate-700">{deleteUserTarget.email || "No email"}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Job Role</p>
                  <p className="mt-1 text-slate-700">{deleteUserTarget.job_role || "Not set"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">System Role</p>
                  <p className="mt-1 text-slate-700">{deleteUserTarget.system_role || "user"}</p>
                </div>
              </div>
            </div>

            {loadingDeleteImpact ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Checking owned projects...</div>
            ) : deleteImpact ? (
              <div className="space-y-3">
                {deleteImpact.ownershipTransfers.length > 0 ? (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                    <p className="text-sm font-semibold text-blue-900">Project ownership will be transferred</p>
                    <div className="mt-3 space-y-2">
                      {deleteImpact.ownershipTransfers.map((transfer) => (
                        <div key={transfer.projectId} className="text-sm text-blue-900">
                          <span className="font-semibold">{transfer.projectName || "Untitled project"}</span>
                          <span className="mx-2">-&gt;</span>
                          <span>{transfer.newOwnerName || transfer.newOwnerEmail || transfer.newOwnerId}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {deleteImpact.projectsToArchive.length > 0 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-sm font-semibold text-amber-900">Projects that will be archived</p>
                    <div className="mt-3 space-y-1">
                      {deleteImpact.projectsToArchive.map((project) => (
                        <p key={project.projectId} className="text-sm text-amber-900">
                          {project.projectName || "Untitled project"}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={closeDeleteUserModal} disabled={isDeletingUser}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void handleDeleteUser()}
                disabled={isDeletingUser}
                className="bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDeletingUser ? "Deleting..." : "Delete User"}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
