"use client";

import { useEffect, useState } from "react";
import ProjectCard from "@/components/dashboard/ProjectCard";
import Button from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import { supabase } from "@/lib/supabaseClient";

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  owner_id: string | null;
  users: {
    id: string | null;
    name: string | null;
  } | null;
  project_members: { id: string | null; user_id: string | null }[] | null;
};

export default function DashboardPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const fetchProjectsForUser = async (userId: string, isAdmin: boolean) => {
    let projectQuery = supabase
      .from("projects")
      .select(
        `
          id,
          name,
          description,
          owner_id,
          users!projects_owner_id_fkey (
            id,
            name
          ),
          project_members (
            id,
            user_id
          )
        `,
      )
      .eq("is_active", true)
      .order("name");

    if (!isAdmin) {
      const { data: membershipRows, error: membershipError } = await supabase
        .from("project_members")
        .select("project_id")
        .eq("user_id", userId);

      if (membershipError) {
        throw membershipError;
      }

      const projectIds = Array.from(
        new Set(
          (membershipRows ?? [])
            .map((row) => row.project_id)
            .filter((id): id is string => Boolean(id)),
        ),
      );

      if (projectIds.length > 0) {
        projectQuery = projectQuery.or(`owner_id.eq.${userId},id.in.(${projectIds.join(",")})`);
      } else {
        projectQuery = projectQuery.eq("owner_id", userId);
      }
    }

    const { data, error } = await projectQuery;

    if (error) {
      throw error;
    }

    console.log("Projects:", data ?? []);
    (data ?? []).forEach((project) => {
      const typedProject = project as unknown as ProjectRow;
      console.log("Project:", typedProject);
      console.log("Owner:", typedProject.users ?? null);
      console.log("Members:", typedProject.project_members ?? []);
    });

    return (data ?? []) as unknown as ProjectRow[];
  };

  useEffect(() => {
    let isMounted = true;

    const loadUserAndProjects = async () => {
      console.log("Fetching projects...");
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          console.error(userError);
          alert(userError.message);
          return;
        }

        if (isMounted) {
          setCurrentUserId(user?.id ?? null);
        }

        if (!user?.id) {
          if (isMounted) {
            setProjects([]);
          }
          return;
        }

        const { data: userProfile, error: userProfileError } = await supabase
          .from("users")
          .select("system_role")
          .eq("id", user.id)
          .single();

        if (userProfileError) {
          console.error(userProfileError);
          alert(userProfileError.message);
          return;
        }

        console.log("User role:", userProfile?.system_role ?? null);

        const isAdmin = (userProfile?.system_role ?? "").toLowerCase() === "admin";
        const isSuperAdminUser = (userProfile?.system_role ?? "").toLowerCase() === "admin";

        if (isMounted) {
          setIsSuperAdmin(isSuperAdminUser);
        }

        const fetchedProjects = await fetchProjectsForUser(user.id, isAdmin);

        if (isMounted) {
          setProjects(fetchedProjects);
          setErrorMessage(null);
        }
      } catch (error) {
        console.error("Failed to load projects", error);
        if (error && typeof error === "object" && "message" in error) {
          alert(String((error as { message?: string }).message ?? "Failed to load projects"));
        }
        if (isMounted) {
          setErrorMessage("Failed to load projects");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadUserAndProjects();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleDelete = async (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) {
      alert("Project not found");
      return;
    }

    if (currentUserId !== project.owner_id && !isSuperAdmin) {
      alert("Only project owner or super admin can delete");
      return;
    }

    const confirmed = window.confirm("Are you sure? The project will be archived.");
    if (!confirmed) {
      return;
    }

    console.log("Soft deleted project:", projectId);

    const { error: updateError } = await supabase
      .from("projects")
      .update({ is_active: false })
      .eq("id", projectId);

    if (updateError) {
      console.error(updateError);
      alert(updateError.message);
      return;
    }

    setProjects((prev) => prev.filter((project) => project.id !== projectId));
  };

  const handleCreateProject = async () => {
    if (!projectName.trim()) {
      alert("Project name is required.");
      return;
    }

    if (startDate && endDate && endDate < startDate) {
      alert("End date cannot be earlier than start date.");
      return;
    }

    setIsCreatingProject(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        console.error(userError);
        alert(userError.message);
        return;
      }

      if (!user) {
        alert("You must be logged in to create a project.");
        return;
      }

      const payload = {
        name: projectName.trim(),
        description: projectDescription.trim() || null,
        owner_id: user.id,
        start_date: startDate || null,
        end_date: endDate || null,
      };

      const { data: insertedProject, error: insertError } = await supabase
        .from("projects")
        .insert(payload)
        .select("id")
        .single();

      if (insertError) {
        console.error(insertError);
        alert(insertError.message);
        return;
      }

      const { error: membershipError } = await supabase.from("project_members").insert({
        project_id: insertedProject.id,
        user_id: user.id,
        role: "creator",
      });

      if (membershipError) {
        console.error(membershipError);
        alert(membershipError.message);
        return;
      }

      const { data: userProfile, error: userProfileError } = await supabase
        .from("users")
        .select("system_role")
        .eq("id", user.id)
        .single();

      if (userProfileError) {
        console.error(userProfileError);
        alert(userProfileError.message);
        return;
      }

      console.log("User role:", userProfile?.system_role ?? null);

      const isAdmin = (userProfile?.system_role ?? "").toLowerCase() === "admin";
      const fetchedProjects = await fetchProjectsForUser(user.id, isAdmin);
      setProjects(fetchedProjects);
      setProjectName("");
      setProjectDescription("");
      setStartDate("");
      setEndDate("");
      setIsCreateModalOpen(false);
    } catch (error) {
      console.error(error);
      if (error && typeof error === "object" && "message" in error) {
        alert(String((error as { message?: string }).message ?? "Failed to create project"));
      } else {
        alert("Failed to create project");
      }
    } finally {
      setIsCreatingProject(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-500">
        Loading projects...
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-red-600">
        {errorMessage}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-xl font-semibold text-slate-900">No projects yet</p>
        <p className="text-sm text-slate-500">Create a project to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-400">Dashboard</p>
          <h1 className="text-3xl font-semibold text-slate-900">Projects</h1>
          <p className="mt-2 text-sm text-slate-500">Browse all projects in your workspace.</p>
        </div>
        <Button
          type="button"
          className="self-start rounded-xl px-4 py-2"
          onClick={() => setIsCreateModalOpen(true)}
        >
          Create Project
        </Button>
      </header>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((project) => {
          const ownerId = project.owner_id ?? "";
          const ownerName = project.users?.name ?? "Unknown";
          const memberCount = project.project_members?.length ?? 0;

          return (
            <ProjectCard
              key={project.id}
              projectId={project.id}
              projectName={project.name}
              ownerName={ownerName}
              ownerId={ownerId}
              memberCount={memberCount}
              currentUserId={currentUserId}
              isSuperAdmin={isSuperAdmin}
              onDelete={handleDelete}
            />
          );
        })}
      </div>

      <Modal
        title="Create Project"
        isOpen={isCreateModalOpen}
        onClose={() => {
          if (isCreatingProject) {
            return;
          }
          setIsCreateModalOpen(false);
        }}
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="project-name" className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
              Project Name
            </label>
            <input
              id="project-name"
              type="text"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="Enter project name"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
              disabled={isCreatingProject}
            />
          </div>

          <div>
            <label htmlFor="project-description" className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
              Description
            </label>
            <textarea
              id="project-description"
              value={projectDescription}
              onChange={(event) => setProjectDescription(event.target.value)}
              placeholder="Optional description"
              className="mt-1 min-h-[96px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
              disabled={isCreatingProject}
            />
          </div>

          <div>
            <label htmlFor="project-start-date" className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
              Start Date
            </label>
            <input
              id="project-start-date"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
              disabled={isCreatingProject}
            />
          </div>

          <div>
            <label htmlFor="project-end-date" className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
              End Date
            </label>
            <input
              id="project-end-date"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
              disabled={isCreatingProject}
            />
          </div>

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsCreateModalOpen(false)}
              disabled={isCreatingProject}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCreateProject}
              disabled={isCreatingProject || !projectName.trim()}
            >
              {isCreatingProject ? "Creating..." : "Create Project"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
