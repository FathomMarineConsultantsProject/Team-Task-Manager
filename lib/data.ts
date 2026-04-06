import type { ColumnId, Task } from "@/components/board/types";

export type UserRole = "admin" | "user";

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

export type Project = {
  id: string;
  name: string;
  ownerId: string;
  members: string[];
};

export const MOCK_USERS: AppUser[] = [
  { id: "1", name: "Admin", email: "admin@test.com", role: "admin" },
  { id: "2", name: "User1", email: "user@test.com", role: "user" },
];

export const createEmptyColumns = (): Record<ColumnId, Task[]> => ({
  todo: [],
  inProgress: [],
  review: [],
  done: [],
});

const productLaunchTasks: Record<ColumnId, Task[]> = {
  todo: [
    {
      id: "PROJ-101",
      title: "Research competitor pricing models",
      direction: "right",
      initials: "AJ",
      accent: "bg-orange-500",
    },
    {
      id: "PROJ-102",
      title: "Draft Q3 marketing campaign",
      direction: "down",
      initials: "MB",
      accent: "bg-sky-500",
    },
  ],
  inProgress: [
    {
      id: "PROJ-103",
      title: "Implement authentication flow",
      direction: "up",
      initials: "SJ",
      accent: "bg-emerald-500",
    },
    {
      id: "PROJ-104",
      title: "Fix navigation bug on mobile",
      direction: "down",
      initials: "AL",
      accent: "bg-blue-500",
    },
  ],
  review: [
    {
      id: "PROJ-105",
      title: "Update privacy policy",
      direction: "right",
      initials: "DP",
      accent: "bg-amber-500",
    },
  ],
  done: [
    {
      id: "PROJ-106",
      title: "Setup CI/CD pipeline",
      direction: "up",
      initials: "KO",
      accent: "bg-emerald-600",
    },
  ],
};

export const SEED_PROJECTS: Project[] = [
  { id: "product-launch", name: "Product Launch", ownerId: "1", members: ["1", "2"] },
  { id: "website-refresh", name: "Website Refresh", ownerId: "2", members: ["2"] },
];

export const SEED_TASKS: Record<string, Record<ColumnId, Task[]>> = {
  [SEED_PROJECTS[0].id]: productLaunchTasks,
  [SEED_PROJECTS[1].id]: createEmptyColumns(),
};
