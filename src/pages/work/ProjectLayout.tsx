import React, { useEffect, useState } from 'react';
import { useParams, Outlet, useNavigate, Link } from 'react-router-dom';
import { useWork } from '../../contexts/WorkContext';
import { useApp } from '../../contexts/AppContext';
import {
  UserPlus,
  Maximize2,
  Minimize2,
  ChevronLeft,
  Search
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../supabase';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';

export const ProjectLayout: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const { projects, selectedProject, setSelectedProject } = useWork();
  const { isSidebarHidden, setIsSidebarHidden } = useApp();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Invite Modal State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmailSearch, setInviteEmailSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedInviteUser, setSelectedInviteUser] = useState<any | null>(null);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);

  useEffect(() => {
    if (projects.length > 0 && projectId) {
      const found = projects.find(p => p.id === projectId || p.fsId === projectId || p.sbId === projectId);
      if (found) {
        setSelectedProject(found);
      }
    }
  }, [projectId, projects, setSelectedProject]);

  useEffect(() => {
    return () => {
      setIsSidebarHidden(false);
    };
  }, [setIsSidebarHidden]);

  if (!selectedProject) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        <p className="text-sm text-muted-foreground font-semibold">Loading Project Context...</p>
        <Link to="/work/projects" className="text-xs text-primary underline">Back to Projects List</Link>
      </div>
    );
  }

  const currentUserMember = selectedProject.members?.find(m => m.userId === user?.uid);
  const currentRole = currentUserMember?.role || 'member';

  const handleSearchUsers = async () => {
    if (!inviteEmailSearch.trim() || !isSupabaseConfigured) return;
    setIsSearchingUsers(true);
    try {
      const term = inviteEmailSearch.trim().toLowerCase();
      const { data } = await supabase.from('users').select('*').or(`email.ilike.%${term}%,display_name.ilike.%${term}%`);
      const filtered = (data || []).map((u: any) => ({
        id: u.id,
        email: u.email,
        displayName: u.display_name
      }));
      setSearchResults(filtered);
    } catch (e) {
      console.error(e);
      toast.error('User search failed');
    } finally {
      setIsSearchingUsers(false);
    }
  };

  const handleSendInvite = async () => {
    if (!user || !selectedProject || !selectedInviteUser || !isSupabaseConfigured) return;
    try {
      await supabase.from('project_invites').insert({
        project_id: selectedProject.id,
        project_name: selectedProject.name,
        invited_email: selectedInviteUser.email,
        invited_by: user.uid,
        invited_by_name: user.displayName || user.email || 'Team Lead',
        status: 'pending'
      });

      await supabase.from('notifications').insert({
        user_id: selectedInviteUser.id,
        message: `You have been invited to join project "${selectedProject.name}"!`
      });

      toast.success(`Invite sent to ${selectedInviteUser.email}`);
      setShowInviteModal(false);
      setSelectedInviteUser(null);
      setInviteEmailSearch('');
      setSearchResults([]);
    } catch (e) {
      console.error(e);
      toast.error('Failed to send invite');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Navigation & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-6 rounded-3xl border border-border">
        <div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/work/projects')}
              className="text-xs font-bold text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
            >
              <ChevronLeft size={14} /> Projects
            </button>
            <span className="text-muted-foreground">/</span>
            <h1 className="text-2xl font-extrabold text-foreground">{selectedProject.name}</h1>
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase bg-primary/10 text-primary border border-primary/20">
              {currentRole.replace('_', ' ')}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
            {selectedProject.description || 'Unified Work Engine Workspace'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSidebarHidden(!isSidebarHidden)}
            className="p-2.5 rounded-2xl border border-border bg-muted/50 hover:bg-muted text-foreground text-xs font-bold transition-all flex items-center gap-2"
            title={isSidebarHidden ? "Exit Full Screen" : "Full Screen"}
          >
            {isSidebarHidden ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            <span className="hidden sm:inline">{isSidebarHidden ? 'Exit Focus' : 'Focus Mode'}</span>
          </button>

          <button
            onClick={() => setShowInviteModal(true)}
            className="bg-primary text-primary-foreground text-xs font-bold px-4 py-2.5 rounded-2xl hover:shadow-lg transition-all flex items-center gap-2"
          >
            <UserPlus size={16} />
            Invite Team
          </button>
        </div>
      </div>

      {/* Sub-screen Content Rendered via Outlet */}
      <main>
        <Outlet />
      </main>

      {/* Team Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-md rounded-3xl p-6 border border-border shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg">Invite Team Member</h3>
              <button onClick={() => setShowInviteModal(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <p className="text-xs text-muted-foreground">Search team member by email or name to send an invite.</p>

            <div className="flex gap-2">
              <input
                type="email"
                placeholder="Enter member email..."
                value={inviteEmailSearch}
                onChange={e => setInviteEmailSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearchUsers()}
                className="flex-1 bg-muted border border-border rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-primary outline-none"
              />
              <button
                onClick={handleSearchUsers}
                disabled={isSearchingUsers}
                className="bg-primary text-primary-foreground px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1"
              >
                <Search size={14} /> Search
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="max-h-48 overflow-y-auto space-y-2 border border-border rounded-xl p-2 bg-muted/30">
                {searchResults.map(u => (
                  <div
                    key={u.id}
                    onClick={() => setSelectedInviteUser(u)}
                    className={`p-2.5 rounded-lg border text-xs cursor-pointer flex justify-between items-center transition-all ${
                      selectedInviteUser?.id === u.id
                        ? 'border-primary bg-primary/10 text-primary font-bold'
                        : 'border-border hover:bg-muted'
                    }`}
                  >
                    <div>
                      <p className="font-semibold">{u.displayName || u.email}</p>
                      <p className="text-[10px] text-muted-foreground">{u.email}</p>
                    </div>
                    {selectedInviteUser?.id === u.id && <span>✓ Selected</span>}
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowInviteModal(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-border hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleSendInvite}
                disabled={!selectedInviteUser}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-primary text-primary-foreground disabled:opacity-50"
              >
                Send Invitation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
