import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Project } from "../types";

interface ProjectStore {
  activeProject: Project | null;
  setActiveProject: (p: Project | null) => void;
  // Projects list cached locally so sidebar doesn't need to re-fetch
  projects: Project[];
  setProjects: (list: Project[]) => void;
  addProject: (p: Project) => void;
  updateProject: (p: Project) => void;
  removeProject: (id: string) => void;
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set) => ({
      activeProject: null,
      projects: [],
      setActiveProject: (p) => set({ activeProject: p }),
      setProjects: (list) => set({ projects: list }),
      addProject: (p) => set((s) => ({ projects: [p, ...s.projects] })),
      updateProject: (p) => set((s) => ({
        projects: s.projects.map((x) => (x.id === p.id ? p : x)),
        activeProject: s.activeProject?.id === p.id ? p : s.activeProject,
      })),
      removeProject: (id) => set((s) => ({
        projects: s.projects.filter((x) => x.id !== id),
        activeProject: s.activeProject?.id === id ? (s.projects.find((x) => x.id !== id) ?? null) : s.activeProject,
      })),
    }),
    {
      name: "testforge-projects",
      merge: (persisted: any, current) => ({
        ...current,
        ...persisted,
        projects: Array.isArray(persisted?.projects) ? persisted.projects : [],
      }),
    }
  )
);
