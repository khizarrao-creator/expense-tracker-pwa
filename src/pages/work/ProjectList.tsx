import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWork } from '../../contexts/WorkContext';
import {
  FolderKanban,
  Plus,
  Users,
  ChevronRight,
  X,
  Check,
  Search,
  Sparkles,
  Inbox
} from 'lucide-react';

export const ProjectList: React.FC = () => {
  const { projects, invites, loading, createProject, acceptInvite, declineInvite } = useWork();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'projects' | 'invites'>('projects');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    setIsCreating(true);

    const createdId = await createProject(newProjectName.trim(), newProjectDesc.trim());
    setIsCreating(false);

    if (createdId) {
      setShowCreateModal(false);
      setNewProjectName('');
      setNewProjectDesc('');
      navigate(`/work/projects/${createdId}`);
    }
  };

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.description || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            Work Engine Projects
            <Sparkles className="text-primary animate-pulse" size={20} />
          </h1>
          <p className="text-muted-foreground mt-1 font-medium text-sm">
            Unified workspace for projects, tasks, CRM leads, customer management, and team collaboration.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-primary text-primary-foreground py-3 px-5 rounded-2xl shadow-lg hover:shadow-primary/20 hover:scale-[1.02] transition-all flex items-center gap-2 font-semibold text-sm self-start md:self-auto"
        >
          <Plus size={18} />
          <span>New Project</span>
        </button>
      </div>

      {/* Search & Tabs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab('projects')}
            className={`py-2.5 px-5 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'projects'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <FolderKanban size={16} />
            Projects ({projects.length})
          </button>
          <button
            onClick={() => setActiveTab('invites')}
            className={`py-2.5 px-5 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'invites'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Inbox size={16} />
            Invites ({invites.length})
          </button>
        </div>

        {activeTab === 'projects' && (
          <div className="relative w-full sm:w-64">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-card border border-border rounded-xl py-2 pl-9 pr-4 text-xs outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        )}
      </div>

      {/* Projects Grid View */}
      {activeTab === 'projects' && (
        <>
          {filteredProjects.length === 0 ? (
            <div className="py-16 text-center border border-dashed border-border rounded-3xl bg-card">
              <FolderKanban size={36} className="text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-semibold text-muted-foreground">No projects found.</p>
              <p className="text-xs text-muted-foreground mt-1">Create your first project to get started!</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-4 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-xs font-bold"
              >
                + Create Project
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredProjects.map(proj => (
                <div
                  key={proj.id}
                  onClick={() => navigate(`/work/projects/${proj.id}`)}
                  className="bg-card border border-border rounded-3xl p-6 shadow-sm hover:border-primary/50 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-mono uppercase font-extrabold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                        Active Workspace
                      </span>
                      <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                        <Users size={14} /> {proj.members?.length || 1}
                      </span>
                    </div>

                    <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                      {proj.name}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2 leading-relaxed">
                      {proj.description || 'No description provided.'}
                    </p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-border/50 flex items-center justify-between text-xs font-semibold text-muted-foreground">
                    <span>{proj.createdByName || 'Owner'}</span>
                    <span className="text-primary flex items-center gap-1 font-bold group-hover:translate-x-1 transition-transform">
                      Open Engine <ChevronRight size={14} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Invites Tab View */}
      {activeTab === 'invites' && (
        <div className="space-y-4">
          {invites.length === 0 ? (
            <div className="py-16 text-center border border-dashed border-border rounded-3xl bg-card">
              <Inbox size={36} className="text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-semibold text-muted-foreground">No pending invitations.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {invites.map(inv => (
                <div key={inv.id} className="bg-card border border-border p-5 rounded-2xl flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-sm">{inv.projectName}</h4>
                    <p className="text-xs text-muted-foreground">Invited by: {inv.invitedByName}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => declineInvite(inv)}
                      className="p-2 rounded-xl border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive text-xs flex items-center gap-1 font-semibold"
                    >
                      <X size={14} /> Decline
                    </button>
                    <button
                      onClick={() => acceptInvite(inv)}
                      className="p-2 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1"
                    >
                      <Check size={14} /> Accept
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-md rounded-3xl p-6 border border-border shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg">Create New Project</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-bold mb-1">Project Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Q3 Mobile App Launch"
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  className="w-full bg-muted border border-border rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1">Description (Optional)</label>
                <textarea
                  placeholder="Brief summary of goals and scope..."
                  value={newProjectDesc}
                  onChange={e => setNewProjectDesc(e.target.value)}
                  className="w-full bg-muted border border-border rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary resize-none h-24"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 text-xs font-semibold rounded-xl border border-border hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-5 py-2.5 text-xs font-bold rounded-xl bg-primary text-primary-foreground hover:shadow-lg disabled:opacity-50"
                >
                  {isCreating ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
