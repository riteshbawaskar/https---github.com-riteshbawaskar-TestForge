import { ReactNode, useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useProjectStore } from "../../store/useProjectStore";
import { projectsApi } from "../../api/projects";
import type { Project } from "../../types";

const navItems = [
  { to: "/dashboard", icon: "📊", label: "Dashboard" },
  { to: "/config",    icon: "⚙️",  label: "Configuration" },
  { to: "/documents", icon: "📁",  label: "Documents" },
  { to: "/design",    icon: "🧪",  label: "Design Tests" },
];

const titleMap: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/config":    "Configuration",
  "/documents": "Documents",
  "/design":    "Design Tests",
};

export default function Layout({ children }: { children: ReactNode }) {
  const nav      = useNavigate();
  const location = useLocation();
  const path     = location.pathname;

  const { activeProject, projects, setActiveProject, setProjects, addProject, removeProject } =
    useProjectStore();

  const [showSwitcher, setShowSwitcher]   = useState(false);
  const [showNewForm,  setShowNewForm]    = useState(false);
  const [newName,      setNewName]        = useState("");
  const [creating,     setCreating]       = useState(false);
  const [deleting,     setDeleting]       = useState<string | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(false);

  // Bootstrap: load all projects on mount
  useEffect(() => {
    async function load() {
      setLoadingProjects(true);
      try {
        const list = await projectsApi.list();
        setProjects(list);
        if (!activeProject && list.length > 0) setActiveProject(list[0]);
      } catch { /* backend not yet started */ }
      setLoadingProjects(false);
    }
    load();
  }, []);

  const switchProject = (p: Project) => {
    setActiveProject(p);
    setShowSwitcher(false);
    // Navigate to dashboard on switch
    nav("/dashboard");
  };

  const createProject = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const p = await projectsApi.create({ name: newName.trim() });
      addProject(p);
      setActiveProject(p);
      setNewName("");
      setShowNewForm(false);
      setShowSwitcher(false);
      nav("/config");
    } catch (e: any) {
      alert(e.message);
    } finally {
      setCreating(false);
    }
  };

  const deleteProject = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Delete this project and all its data?")) return;
    setDeleting(id);
    try {
      await projectsApi.delete(id);
      removeProject(id);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setDeleting(null);
    }
  };

  const isDesign = path === "/design";

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 min-w-[224px] bg-white border-r border-gray-200 flex flex-col">
        {/* Logo */}
        <div className="px-4 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm">TF</div>
            <div>
              <div className="font-semibold text-gray-900 text-sm leading-tight">TestForge</div>
              <div className="text-xs text-gray-400">AI Test Designer</div>
            </div>
          </div>
        </div>

        {/* Project Switcher */}
        <div className="px-3 py-2.5 border-b border-gray-100">
          <button
            onClick={() => setShowSwitcher(s => !s)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors text-left"
          >
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-gray-700 truncate">
                {activeProject?.name ?? "No project"}
              </div>
              <div className="text-xs text-gray-400 truncate">
                {activeProject ? "Active project" : "Select a project"}
              </div>
            </div>
            <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${showSwitcher ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>

          {/* Dropdown */}
          {showSwitcher && (
            <div className="mt-1.5 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-50">
              {loadingProjects ? (
                <div className="px-3 py-2.5 text-xs text-gray-500">Loading projects…</div>
              ) : projects.length === 0 ? (
                <div className="px-3 py-2.5 text-xs text-gray-500">No projects yet</div>
              ) : (
                <div className="max-h-48 overflow-y-auto">
                  {projects?.map(p => (
                    <button
                      key={p.id}
                      onClick={() => switchProject(p)}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors group border-b border-gray-50 last:border-0 ${activeProject?.id === p.id ? "bg-blue-50" : ""}`}
                    >
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${activeProject?.id === p.id ? "bg-blue-500" : "bg-gray-300"}`} />
                      <div className="flex-1 min-w-0">
                        <div className={`text-xs font-medium truncate ${activeProject?.id === p.id ? "text-blue-700" : "text-gray-900"}`}>{p.name}</div>
                        {p.gitlab_project_path && <div className="text-xs text-gray-400 truncate">{p.gitlab_project_path}</div>}
                      </div>
                      <button
                        onClick={(e) => deleteProject(e, p.id)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-100 hover:text-red-600 text-gray-400 text-xs transition-all"
                        title="Delete project"
                      >
                        {deleting === p.id ? "…" : "✕"}
                      </button>
                    </button>
                  ))}
                </div>
              )}

              {/* New project inline form */}
              {showNewForm ? (
                <div className="px-3 py-2.5 bg-gray-50 border-t border-gray-100">
                  <input
                    autoFocus
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") createProject(); if (e.key === "Escape") setShowNewForm(false); }}
                    placeholder="Project name…"
                    className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 mb-1.5 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
                  />
                  <div className="flex gap-1.5">
                    <button onClick={createProject} disabled={creating || !newName.trim()} className="flex-1 bg-blue-600 text-white rounded px-2 py-1 text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                      {creating ? "Creating…" : "Create"}
                    </button>
                    <button onClick={() => { setShowNewForm(false); setNewName(""); }} className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowNewForm(true)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-blue-600 hover:bg-blue-50 transition-colors border-t border-gray-100 font-medium"
                >
                  <span className="text-base leading-none">+</span> New project
                </button>
              )}
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2 overflow-y-auto">
          <div className="px-3 pb-1 pt-2">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider px-2">Navigation</p>
          </div>
          {navItems.map(item => (
            <NavLink key={item.to} to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-5 py-2.5 text-sm font-medium transition-colors
                 ${isActive
                   ? "bg-blue-50 text-blue-700 border-r-2 border-blue-600"
                   : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}
            >
              <span className="text-base w-5 text-center">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${activeProject ? "bg-green-500" : "bg-gray-300"}`} />
            <span className="text-xs text-gray-500">
              {activeProject ? "Project active" : "No project selected"}
            </span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
          <h1 className="text-base font-semibold text-gray-900">
            {titleMap[path] ?? "TestForge"}
          </h1>
          {activeProject && (
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500 pulse-dot" />
                {activeProject.name}
              </span>
              <span className="text-gray-300">·</span>
              <span className="text-xs text-gray-400 font-mono">{activeProject.llm_provider}/{activeProject.llm_model}</span>
            </div>
          )}
        </header>

        <main className={`flex-1 ${isDesign ? "overflow-hidden" : "overflow-y-auto"}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
