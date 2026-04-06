"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

type WorkspaceUser = {
  id: string;
  email: string | null;
  name: string | null;
  job_role: string | null;
  system_role: string | null;
  role: string | null;
};

type ProjectSummary = {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  ownerName: string;
  memberCount: number;
  is_active?: boolean;
  is_completed?: boolean;
};

type AppDataContextValue = {
  supabase: SupabaseClient;
  authUser: User | null;
  profile: WorkspaceUser | null;
  isAuthLoading: boolean;
  projects: ProjectSummary[];
  isProjectsLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProjects: () => Promise<void>;
  createProject: (payload: { name: string; description: string }) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
};

const AppDataContext = createContext<AppDataContextValue | undefined>(undefined);

type ProjectRecord = {
  id: string;
  name: string;
  description: string | null;
  owner_id: string | null;
  is_active?: boolean;
  is_completed?: boolean;
  owner?: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
};

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<WorkspaceUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isProjectsLoading, setIsProjectsLoading] = useState(false);
  const profileRef = useRef<WorkspaceUser | null>(null);
  profileRef.current = profile;

  const logSupabaseError = (error: unknown) => {
    if (!error) {
      return;
    }

    console.error("SUPABASE ERROR FULL:", {
      message: (error as { message?: string })?.message ?? null,
      details: (error as { details?: string })?.details ?? null,
      hint: (error as { hint?: string })?.hint ?? null,
      code: (error as { code?: string })?.code ?? null,
      raw: error,
    });
  };

  const logSupabaseRequest = async (context: Record<string, unknown>) => {
    console.log("SUPABASE REQUEST:", context);
    const { data } = await supabase.auth.getUser();
    console.log("AUTH USER:", data?.user ?? null);
  };

  useEffect(() => {
    void supabase.auth.getUser().then((res) => {
      console.log("GLOBAL AUTH:", res.data.user ?? null);
    });
  }, []);

  const loadUserProfile = useCallback(
    async (user: User): Promise<WorkspaceUser> => {
      const authFallback: WorkspaceUser = {
        id: user.id,
        name: null,
        email: user.email ?? null,
        job_role: null,
        system_role: null,
        role: null,
      };

      try {
        await logSupabaseRequest({ operation: "users.select_profile", user_id: user.id });
        const { data: profileData, error: profileError } = await supabase
          .from("users")
          .select("id, name, email, job_role, system_role")
          .eq("id", user.id)
          .single();

        if (profileError || !profileData) {
          throw profileError ?? new Error("Profile not found");
        }

        return {
          id: profileData.id,
          name: profileData.name ?? null,
          email: profileData.email ?? user.email ?? null,
          job_role: profileData.job_role ?? null,
          system_role: profileData.system_role ?? null,
          role: profileData.system_role ?? null,
        };
      } catch (profileError) {
        logSupabaseError(profileError);
        return authFallback;
      }
    },
    [],
  );

  const loadSession = useCallback(async () => {
    setIsAuthLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      console.log("AUTH USER:", user ?? null);

      if (user) {
        setAuthUser(user);
        const loadedProfile = await loadUserProfile(user);
        setProfile(loadedProfile);
      } else {
        setAuthUser(null);
        setProfile(null);
        router.replace("/login");
      }
    } finally {
      setIsAuthLoading(false);
    }
  }, [router, supabase, loadUserProfile]);

  const refreshProjects = useCallback(async () => {
    const activeProfile = profileRef.current;

    if (!activeProfile?.id) {
      setProjects([]);
      return;
    }

    setIsProjectsLoading(true);

    try {
      const normalizedSystemRole = (activeProfile.system_role ?? activeProfile.role ?? "").toLowerCase();
      const isAdmin = normalizedSystemRole === "admin";

      let projectQuery = supabase
        .from("projects")
        .select(
          `
            id,
            name,
            description,
            owner_id,
            is_active,
            is_completed,
            owner:users!projects_owner_id_fkey ( id, name, email )
          `,
        )
        .order("name");

      if (!isAdmin) {
        let projectIds: string[] = [];

        await logSupabaseRequest({
          operation: "project_members.select",
          filters: { user_id: activeProfile.id },
        });
        const { data: membershipRows, error: membershipError } = await supabase
          .from("project_members")
          .select("project_id")
          .eq("user_id", activeProfile.id);

        if (membershipError) {
          logSupabaseError(membershipError);
          throw new Error(membershipError.message ?? "Failed to load memberships");
        }

        projectIds = Array.from(
          new Set(
            (membershipRows ?? [])
              .map((row) => row.project_id)
              .filter((id): id is string => Boolean(id)),
          ),
        );

        if (projectIds.length > 0) {
          const membershipFilter = `id.in.(${projectIds.join(",")})`;
          projectQuery = projectQuery.or([`owner_id.eq.${activeProfile.id}`, membershipFilter].join(","));
        } else {
          projectQuery = projectQuery.eq("owner_id", activeProfile.id);
        }
      }

      await logSupabaseRequest({
        operation: "projects.select",
        filters: !isAdmin ? { scope: "owner_or_member", user_id: activeProfile.id } : { scope: "all" },
      });
      const { data, error } = await projectQuery;

      if (error) {
        logSupabaseError(error);
        throw new Error(error.message ?? "Project fetch error");
      }

      const normalized = await Promise.all(
        (data as unknown as ProjectRecord[] | null | undefined)?.map(async (project) => {
          let memberCount = 1;

          try {
            await logSupabaseRequest({
              operation: "project_members.count",
              project_id: project.id,
            });
            const { count, error: countError } = await supabase
              .from("project_members")
              .select("*", { count: "exact", head: true })
              .eq("project_id", project.id);

            if (countError) {
              logSupabaseError(countError);
              throw countError;
            }

            if (typeof count === "number" && count > 0) {
              memberCount = count;
            }
          } catch (countError) {
            logSupabaseError(countError);
          }

          return {
            id: project.id,
            name: project.name,
            description: project.description,
            ownerId: project.owner_id ?? "",
            ownerName: project.owner?.name ?? project.owner?.email ?? project.owner_id ?? "Creator",
            memberCount,
            is_active: (project as any).is_active !== false,
            is_completed: (project as any).is_completed === true,
          } satisfies ProjectSummary;
        }) ?? [],
      );

      setProjects(normalized);
    } catch (error) {
      console.error("Unable to refresh projects", error);
      setProjects([]);
    } finally {
      setIsProjectsLoading(false);
    }
  }, [supabase]);

  const refreshProjectsRef = useRef(refreshProjects);
  refreshProjectsRef.current = refreshProjects;

  const loadSessionRef = useRef(loadSession);
  loadSessionRef.current = loadSession;

  const login = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        throw error;
      }

      await loadSession();
      await refreshProjects();
    },
    [loadSession, refreshProjects, supabase],
  );

  const logout = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Failed to logout", error);
    }
    setAuthUser(null);
    setProfile(null);
    setProjects([]);
    router.push("/login");
  }, [router, supabase]);

  const createProject = useCallback(
    async ({ name, description }: { name: string; description: string }) => {
      if (!profile) {
        throw new Error("You must be logged in to create a project.");
      }

      const trimmedName = name.trim();
      const normalizedDescription = description.trim();

      if (!trimmedName) {
        throw new Error("Project name is required.");
      }

      console.log("User ID:", profile.id);
      console.log("Creating project...");

      await logSupabaseRequest({
        operation: "projects.insert",
        payload: {
          name: trimmedName,
          description: normalizedDescription || null,
          owner_id: profile.id,
        },
      });
      const { data: newProject, error } = await supabase
        .from("projects")
        .insert({
          name: trimmedName,
          description: normalizedDescription || null,
          owner_id: profile.id,
        })
        .select()
        .single();

      if (error || !newProject) {
        logSupabaseError(error);
        throw new Error(error?.message ?? "Unable to create project");
      }

      console.log("Created project:", newProject);

      try {
        await logSupabaseRequest({
          operation: "project_members.insert",
          payload: {
            user_id: profile.id,
            project_id: newProject.id,
            role: "creator",
          },
        });
        const { error: memberError } = await supabase.from("project_members").insert({
          user_id: profile.id,
          project_id: newProject.id,
          role: "creator",
        });

        if (memberError) {
          logSupabaseError(memberError);
          throw new Error(memberError.message ?? "Unable to create project membership");
        }
      } catch (memberError) {
        console.warn("Member insert failed but project exists:", memberError);
      }

      await refreshProjects();
    },
    [profile, refreshProjects, supabase],
  );

  const deleteProject = useCallback(
    async (projectId: string) => {
      const trimmedId = projectId.trim();
      if (!trimmedId) {
        throw new Error("Project id is required to delete a project");
      }

      await logSupabaseRequest({
        operation: "projects.delete",
        project_id: trimmedId,
      });

      const { error } = await supabase.from("projects").delete().eq("id", trimmedId);

      if (error) {
        logSupabaseError(error);
        throw new Error(error.message ?? "Unable to delete project");
      }

      setProjects((current) => current.filter((project) => project.id !== trimmedId));
    },
    [supabase],
  );

  useEffect(() => {
    loadSessionRef.current?.();
  }, []);

  useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("Auth event:", event, "Session user:", session?.user?.email ?? "none");
      if (session?.user) {
        setAuthUser(session.user);
        // Temporarily disable profile sync during auth change events to avoid duplicate writes.
        // void syncUserProfile(session.user)
        //   .then((synced) => {
        //     setProfile(synced);
        //     void refreshProjects();
        //   })
        //   .catch((error) => {
        //     console.error("Profile sync error during auth state change", error);
        //   });
        void refreshProjectsRef.current?.();
      } else {
        setAuthUser(null);
        setProfile(null);
        setProjects([]);
        routerRef.current?.push("/login");
      }
    });

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, []);

  const profileId = profile?.id ?? null;

  useEffect(() => {
    if (!profileId) {
      setProjects([]);
      return;
    }

    void refreshProjectsRef.current?.();
  }, [profileId]);

  const value = useMemo<AppDataContextValue>(
    () => ({
      supabase,
      authUser,
      profile,
      isAuthLoading,
      projects,
      isProjectsLoading,
      login,
      logout,
      refreshProjects,
      createProject,
      deleteProject,
    }),
    [
      authUser,
      createProject,
      deleteProject,
      isAuthLoading,
      isProjectsLoading,
      login,
      logout,
      profile,
      projects,
      refreshProjects,
      supabase,
    ],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error("useAppData must be used within an AppDataProvider");
  }

  return context;
}
