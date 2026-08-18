import React, { useState } from 'react';
import { useWork, ProjectMember } from '../../contexts/WorkContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase, isSupabaseConfigured } from '../../supabase';
import { Users, UserPlus, Shield, Trash2, Mail, CheckCircle2, Building2, Briefcase } from 'lucide-react';
import { toast } from 'sonner';

export const ProjectMembers: React.FC = () => {
  const { selectedProject, refreshProjects } = useWork();
  const { user } = useAuth();

  if (!selectedProject) return null;

  const currentUserMember = selectedProject.members?.find(m => m.userId === user?.uid);
  const currentRole = currentUserMember?.role || 'member';
  const isLeadOrOwner = currentRole === 'team_lead' || currentRole === 'owner' || currentRole === 'line_manager';

  const handleUpdateRole = async (targetUserId: string, newRole: 'member' | 'team_lead' | 'line_manager') => {
    if (!selectedProject || !isSupabaseConfigured) return;
    try {
      await supabase.from('project_members').update({ role: newRole }).eq('project_id', selectedProject.id).eq('user_id', targetUserId);
      toast.success('Member role updated');
      await refreshProjects();
    } catch (e) {
      toast.error('Failed to update role');
    }
  };

  const handleRemoveMember = async (targetUserId: string) => {
    if (!selectedProject || !confirm('Remove this member from the project?') || !isSupabaseConfigured) return;
    try {
      await supabase.from('project_members').delete().eq('project_id', selectedProject.id).eq('user_id', targetUserId);
      toast.success('Member removed');
      await refreshProjects();
    } catch (e) {
      toast.error('Failed to remove member');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-foreground flex items-center gap-2">
            <Users className="text-primary" size={20} /> Team Members & HR Roster
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage project roles, access permissions, and team member profiles.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {selectedProject.members?.map(m => {
          const isOwner = m.role === 'owner';
          const isSelf = m.userId === user?.uid;

          return (
            <div key={m.userId || m.email} className="bg-card border border-border rounded-3xl p-6 shadow-xs flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full border ${
                    isOwner ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                    m.role === 'team_lead' ? 'bg-primary/10 text-primary border-primary/20' :
                    'bg-muted text-muted-foreground border-border'
                  }`}>
                    {m.role.replace('_', ' ')}
                  </span>

                  {isSelf && (
                    <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                      You
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-primary/20 text-primary font-black text-lg flex items-center justify-center">
                    {(m.displayName || m.email || 'U')[0].toUpperCase()}
                  </div>
                  <div className="truncate">
                    <h4 className="font-bold text-sm text-foreground truncate">{m.displayName || m.email}</h4>
                    <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                  </div>
                </div>
              </div>

              {/* Role & Actions */}
              {isLeadOrOwner && !isOwner && !isSelf && (
                <div className="pt-4 border-t border-border/50 flex items-center justify-between gap-2">
                  <select
                    value={m.role}
                    onChange={e => handleUpdateRole(m.userId, e.target.value as any)}
                    className="bg-muted border border-border rounded-xl px-2.5 py-1 text-xs font-semibold outline-none"
                  >
                    <option value="member">Member</option>
                    <option value="team_lead">Team Lead</option>
                    <option value="line_manager">Line Manager</option>
                  </select>

                  <button
                    onClick={() => handleRemoveMember(m.userId)}
                    className="p-1.5 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                    title="Remove Member"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
