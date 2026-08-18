import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { supabase, isSupabaseConfigured } from '../supabase';
import { db } from '../firebase';
import { collection, doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { toast } from 'sonner';

export interface ProjectMember {
  userId: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: 'member' | 'team_lead' | 'line_manager' | 'owner';
  joinedAt: string;
  status: 'active' | 'invited';
}

export interface Project {
  id: string;
  fsId?: string;
  sbId?: string;
  name: string;
  description: string;
  createdBy: string;
  createdByName: string;
  createdAt: any;
  updatedAt: any;
  status: 'active' | 'archived';
  whiteboardText?: string;
  whiteboardCanvasData?: string;
  members: ProjectMember[];
}

export interface ProjectInvite {
  id: string;
  projectId: string;
  projectName: string;
  invitedBy: string;
  invitedByName: string;
  invitedUserId: string;
  invitedUserEmail: string;
  role: 'member' | 'team_lead' | 'line_manager';
  status: 'pending' | 'accepted' | 'declined';
  createdAt: any;
}

interface WorkContextType {
  projects: Project[];
  invites: ProjectInvite[];
  loading: boolean;
  selectedProject: Project | null;
  setSelectedProject: (project: Project | null) => void;
  createProject: (name: string, description: string) => Promise<string | null>;
  acceptInvite: (invite: ProjectInvite) => Promise<void>;
  declineInvite: (invite: ProjectInvite) => Promise<void>;
  refreshProjects: () => Promise<void>;
}

const WorkContext = createContext<WorkContextType | undefined>(undefined);

export const deduplicateProjects = (list: Project[]): Project[] => {
  const map = new Map<string, Project>();

  list.forEach(p => {
    if (!p || !p.name) return;
    const nameKey = p.name.trim().toLowerCase();

    let matchKey: string | null = null;
    for (const [k, existing] of map.entries()) {
      if (
        existing.id === p.id ||
        (existing.fsId && p.fsId && existing.fsId === p.fsId) ||
        (existing.sbId && p.sbId && existing.sbId === p.sbId) ||
        (existing.name || '').trim().toLowerCase() === nameKey
      ) {
        matchKey = k;
        break;
      }
    }

    if (!matchKey) {
      map.set(p.id, {
        ...p,
        fsId: p.fsId || p.id,
        sbId: p.sbId || p.id
      });
    } else {
      const existing = map.get(matchKey)!;

      const memberMap = new Map<string, any>();
      (existing.members || []).forEach(m => {
        const mKey = (m.userId || m.email || '').toLowerCase();
        if (mKey) memberMap.set(mKey, m);
      });
      (p.members || []).forEach(m => {
        const mKey = (m.userId || m.email || '').toLowerCase();
        if (mKey && !memberMap.has(mKey)) {
          memberMap.set(mKey, m);
        }
      });

      const bestDesc = (p.description && p.description.length > (existing.description || '').length)
        ? p.description
        : existing.description;
      const bestWhiteboard = (p.whiteboardText && p.whiteboardText.length > (existing.whiteboardText || '').length)
        ? p.whiteboardText
        : existing.whiteboardText;

      map.set(matchKey, {
        ...existing,
        fsId: existing.fsId || p.fsId || existing.id,
        sbId: p.sbId || existing.sbId || p.id,
        description: bestDesc || '',
        whiteboardText: bestWhiteboard || '',
        members: Array.from(memberMap.values())
      });
    }
  });

  return Array.from(map.values());
};

export const WorkProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [invites, setInvites] = useState<ProjectInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  const loadProjectsAndInvites = async () => {
    if (!user) {
      setProjects([]);
      setInvites([]);
      setLoading(false);
      return;
    }

    let projectList: Project[] = [];

    if (isSupabaseConfigured) {
      try {
        const { data: memberRows } = await supabase
          .from('project_members')
          .select('project_id')
          .or(`user_id.eq.${user.uid},email.ilike.${user.email || ''}`);

        const memberProjIds = (memberRows || []).map((r: { project_id: string }) => r.project_id);

        let querySupabase = supabase.from('projects').select('*');
        if (memberProjIds.length > 0) {
          querySupabase = querySupabase.or(`owner_id.eq.${user.uid},owner_id.eq.${user.email || ''},id.in.(${memberProjIds.join(',')})`);
        } else {
          querySupabase = querySupabase.or(`owner_id.eq.${user.uid},owner_id.eq.${user.email || ''}`);
        }

        const { data: projs } = await querySupabase.order('created_at', { ascending: false });

        if (projs && projs.length > 0) {
          const allProjIds = projs.map(p => p.id);
          const { data: members } = await supabase.from('project_members').select('*').in('project_id', allProjIds);

          projectList = projs.map((p: Record<string, any>) => {
            const pMembers = (members || []).filter((m: Record<string, any>) => m.project_id === p.id).map((m: Record<string, any>) => ({
              userId: m.user_id,
              email: m.email,
              displayName: m.display_name || m.email,
              photoURL: m.photo_url || '',
              role: m.role || 'member',
              joinedAt: m.joined_at,
              status: 'active' as const
            }));

            if (!pMembers.some((m: { userId: string }) => m.userId === user.uid)) {
              pMembers.unshift({
                userId: user.uid,
                email: user.email || '',
                displayName: user.displayName || user.email || 'Owner',
                photoURL: user.photoURL || '',
                role: 'owner',
                joinedAt: p.created_at || new Date().toISOString(),
                status: 'active'
              });
            }

            return {
              id: p.id,
              sbId: p.id,
              name: p.name,
              description: p.description || '',
              createdBy: p.owner_id,
              createdByName: 'Owner',
              createdAt: p.created_at,
              updatedAt: p.updated_at,
              status: 'active',
              whiteboardText: '',
              members: pMembers
            };
          });

          setProjects(prev => {
            const merged = deduplicateProjects([...projectList, ...prev]);
            try { localStorage.setItem(`user_projects_${user.uid}`, JSON.stringify(merged)); } catch (e) { }
            return merged;
          });
        }
      } catch (e) {
        console.warn('[WorkContext] Supabase project load error:', e);
      }
    }

    if (projectList.length === 0) {
      try {
        const rawLocal = localStorage.getItem(`user_projects_${user.uid}`);
        if (rawLocal) {
          const parsed = JSON.parse(rawLocal);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setProjects(prev => deduplicateProjects([...parsed, ...prev]));
          }
        }
      } catch (e) { }
    }

    if (isSupabaseConfigured) {
      try {
        const { data: inviteRows } = await supabase
          .from('project_invites')
          .select('*')
          .eq('invited_email', user.email || '')
          .eq('status', 'pending');

        setInvites((inviteRows || []).map((i: Record<string, any>) => ({
          id: i.id,
          projectId: i.project_id,
          projectName: i.project_name || 'Project',
          invitedBy: i.invited_by,
          invitedByName: i.invited_by_name || 'Lead',
          invitedUserId: user.uid,
          invitedUserEmail: i.invited_email,
          role: 'member',
          status: 'pending',
          createdAt: i.created_at
        })));
      } catch (e) { }
    }

    setLoading(false);
  };

  useEffect(() => {
    if (!user) {
      setProjects([]);
      setInvites([]);
      setLoading(false);
      return;
    }

    let unsubFirestore: (() => void) | null = null;

    if (db) {
      try {
        const projectsRef = collection(db, 'projects');
        unsubFirestore = onSnapshot(projectsRef, (snapshot) => {
          const fsProjects: Project[] = [];
          snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const members = data.members || [];
            const isMemberOrOwner = data.createdBy === user.uid ||
              members.some((m: any) => m.userId === user.uid || (user.email && m.email === user.email));

            if (isMemberOrOwner) {
              fsProjects.push({
                id: docSnap.id,
                fsId: docSnap.id,
                name: data.name || 'Untitled Project',
                description: data.description || '',
                createdBy: data.createdBy || user.uid,
                createdByName: data.createdByName || 'Owner',
                createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt || new Date().toISOString(),
                updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt || new Date().toISOString(),
                status: data.status || 'active',
                whiteboardText: data.whiteboardText || '',
                members: members
              });
            }
          });

          if (fsProjects.length > 0) {
            setProjects(prev => {
              const merged = deduplicateProjects([...fsProjects, ...prev]);
              try { localStorage.setItem(`user_projects_${user.uid}`, JSON.stringify(merged)); } catch (e) { }
              return merged;
            });
            setLoading(false);
          }
        }, err => console.warn('[WorkContext] Firestore snapshot error:', err));
      } catch (e) {
        console.warn('[WorkContext] Firestore sub error:', e);
      }
    }

    loadProjectsAndInvites();

    if (isSupabaseConfigured) {
      const projChannel = supabase.channel(`user-projects-${user.uid}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => loadProjectsAndInvites())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'project_members' }, () => loadProjectsAndInvites())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'project_invites' }, () => loadProjectsAndInvites())
        .subscribe();

      return () => {
        if (unsubFirestore) unsubFirestore();
        supabase.removeChannel(projChannel);
      };
    }

    return () => {
      if (unsubFirestore) unsubFirestore();
    };
  }, [user]);

  const createProject = async (name: string, description: string): Promise<string | null> => {
    if (!user || !name.trim()) return null;

    let projId = `proj_${Date.now()}`;
    const newProjectObj: Project = {
      id: projId,
      name: name.trim(),
      description: description.trim(),
      createdBy: user.uid,
      createdByName: user.displayName || user.email || 'Owner',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active',
      members: [{
        userId: user.uid,
        email: user.email || '',
        displayName: user.displayName || user.email || 'Owner',
        photoURL: user.photoURL || '',
        role: 'team_lead',
        joinedAt: new Date().toISOString(),
        status: 'active'
      }]
    };

    if (db) {
      try {
        const fsDocRef = doc(collection(db, 'projects'));
        projId = fsDocRef.id;
        newProjectObj.id = projId;
        await setDoc(fsDocRef, {
          id: projId,
          name: newProjectObj.name,
          description: newProjectObj.description,
          createdBy: user.uid,
          createdByName: newProjectObj.createdByName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          status: 'active',
          whiteboardText: '',
          members: newProjectObj.members
        });
      } catch (e) {
        console.warn('[WorkContext] Firestore project create error:', e);
      }
    }

    if (isSupabaseConfigured) {
      try {
        await supabase.from('projects').insert({
          id: projId,
          name: name.trim(),
          description: description.trim(),
          color: '#3B82F6',
          owner_id: user.uid,
        });

        await supabase.from('project_members').insert({
          project_id: projId,
          user_id: user.uid,
          email: user.email || '',
          display_name: user.displayName || user.email || 'Owner',
          photo_url: user.photoURL || '',
          role: 'owner'
        });

        await supabase.from('grid_sheets').insert({
          project_id: projId,
          sheet_name: 'Sheet 1',
          sheet_order: 0,
          columns: [
            { id: 'col_1', name: 'Column 1', type: 'text' },
            { id: 'col_2', name: 'Column 2', type: 'text' },
            { id: 'col_3', name: 'Column 3', type: 'number' }
          ],
          rows: [{ id: `row_${Date.now()}_1`, col_1: '', col_2: '', col_3: '' }]
        });
      } catch (err) {
        console.error('Supabase project creation error:', err);
      }
    }

    const updatedProjects = deduplicateProjects([newProjectObj, ...projects]);
    setProjects(updatedProjects);
    try {
      localStorage.setItem(`user_projects_${user.uid}`, JSON.stringify(updatedProjects));
    } catch (e) { }

    toast.success('Project created successfully!');
    return projId;
  };

  const acceptInvite = async (invite: ProjectInvite) => {
    if (!user || !isSupabaseConfigured) return;
    try {
      await supabase.from('project_members').upsert({
        project_id: invite.projectId,
        user_id: user.uid,
        email: user.email || '',
        display_name: user.displayName || user.email || 'User',
        photo_url: user.photoURL || '',
        role: 'member'
      }, { onConflict: 'project_id,user_id' });

      await supabase.from('project_invites').update({
        status: 'accepted',
        responded_at: new Date().toISOString()
      }).eq('id', invite.id);

      toast.success(`Joined project ${invite.projectName}!`);
      await loadProjectsAndInvites();
    } catch (err) {
      console.error(err);
      toast.error('Failed to accept invite');
    }
  };

  const declineInvite = async (invite: ProjectInvite) => {
    if (!isSupabaseConfigured) return;
    try {
      await supabase.from('project_invites').update({
        status: 'rejected',
        responded_at: new Date().toISOString()
      }).eq('id', invite.id);
      toast.info('Invitation declined');
      await loadProjectsAndInvites();
    } catch (err) {
      console.error(err);
      toast.error('Failed to decline invite');
    }
  };

  return (
    <WorkContext.Provider
      value={{
        projects,
        invites,
        loading,
        selectedProject,
        setSelectedProject,
        createProject,
        acceptInvite,
        declineInvite,
        refreshProjects: loadProjectsAndInvites
      }}
    >
      {children}
    </WorkContext.Provider>
  );
};

export const useWork = () => {
  const context = useContext(WorkContext);
  if (!context) {
    throw new Error('useWork must be used within a WorkProvider');
  }
  return context;
};
