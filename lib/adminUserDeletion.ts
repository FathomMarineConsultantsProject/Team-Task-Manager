import type { SupabaseClient } from "@supabase/supabase-js";

type OwnedProjectRow = {
  id: string;
  name: string | null;
};

type ProjectMemberRow = {
  project_id: string;
  user_id: string | null;
  role: string | null;
};

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  system_role: string | null;
};

export type OwnershipTransferImpact = {
  projectId: string;
  projectName: string | null;
  newOwnerId: string;
  newOwnerName: string | null;
  newOwnerEmail: string | null;
};

export type ProjectArchiveImpact = {
  projectId: string;
  projectName: string | null;
};

export type DeleteUserImpact = {
  ownershipTransfers: OwnershipTransferImpact[];
  projectsToArchive: ProjectArchiveImpact[];
};

const normalizeRole = (role: string | null | undefined) => (role ?? "").toLowerCase();

export const computeDeleteUserImpact = async (adminClient: SupabaseClient, userId: string): Promise<DeleteUserImpact> => {
  const { data: ownedProjects, error: ownedProjectsError } = await adminClient
    .from("projects")
    .select("id, name")
    .eq("owner_id", userId);

  if (ownedProjectsError) {
    throw new Error(ownedProjectsError.message);
  }

  const projectRows = ((ownedProjects as OwnedProjectRow[] | null) ?? []).filter((project) => Boolean(project.id));
  if (projectRows.length === 0) {
    return { ownershipTransfers: [], projectsToArchive: [] };
  }

  const projectIds = projectRows.map((project) => project.id);
  const { data: memberRows, error: membersError } = await adminClient
    .from("project_members")
    .select("project_id, user_id, role")
    .in("project_id", projectIds)
    .neq("user_id", userId);

  if (membersError) {
    throw new Error(membersError.message);
  }

  const members = (((memberRows as ProjectMemberRow[] | null) ?? []).filter((member) => Boolean(member.user_id)) as (ProjectMemberRow & {
    user_id: string;
  })[]);
  const memberUserIds = Array.from(new Set(members.map((member) => member.user_id)));
  const usersById = new Map<string, UserRow>();

  if (memberUserIds.length > 0) {
    const { data: users, error: usersError } = await adminClient
      .from("users")
      .select("id, name, email, system_role")
      .in("id", memberUserIds);

    if (usersError) {
      throw new Error(usersError.message);
    }

    ((users as UserRow[] | null) ?? []).forEach((user) => {
      usersById.set(user.id, user);
    });
  }

  const ownershipTransfers: OwnershipTransferImpact[] = [];
  const projectsToArchive: ProjectArchiveImpact[] = [];

  projectRows.forEach((project) => {
    const candidates = members
      .filter((member) => member.project_id === project.id)
      .sort((left, right) => {
        const leftIsLead = normalizeRole(left.role) === "lead";
        const rightIsLead = normalizeRole(right.role) === "lead";
        if (leftIsLead !== rightIsLead) return leftIsLead ? -1 : 1;

        const leftIsAdmin = normalizeRole(usersById.get(left.user_id)?.system_role) === "admin";
        const rightIsAdmin = normalizeRole(usersById.get(right.user_id)?.system_role) === "admin";
        if (leftIsAdmin !== rightIsAdmin) return leftIsAdmin ? -1 : 1;

        return left.user_id.localeCompare(right.user_id);
      });

    const nextOwner = candidates[0];
    if (!nextOwner) {
      projectsToArchive.push({
        projectId: project.id,
        projectName: project.name,
      });
      return;
    }

    const nextOwnerUser = usersById.get(nextOwner.user_id);
    ownershipTransfers.push({
      projectId: project.id,
      projectName: project.name,
      newOwnerId: nextOwner.user_id,
      newOwnerName: nextOwnerUser?.name ?? null,
      newOwnerEmail: nextOwnerUser?.email ?? null,
    });
  });

  return { ownershipTransfers, projectsToArchive };
};
