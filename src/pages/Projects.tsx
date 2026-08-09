import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useApp } from '../contexts/AppContext';
import { supabase, isSupabaseConfigured } from '../supabase';
import { db } from '../firebase';
import { collection, doc, onSnapshot, getDocs, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import {
  FolderKanban,
  Plus,
  Users,
  UserPlus,
  CheckCircle2,
  Clock,
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
  Check,
  Activity,
  Layout,
  Palette,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Table,
  Briefcase,
  TrendingUp,
  Download,
  Upload,
  Building2,
  Edit2,
  Save,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { toast } from 'sonner';
import { addTask as addSqliteTask } from '../db/queries';
import * as XLSX from 'xlsx';

// Try to dynamically load Tldraw if installed, fallback to clean interactive drawing board if not loaded
let TldrawComponent: any = null;
try {
  const tldrawModule = await import('tldraw');
  TldrawComponent = tldrawModule.Tldraw;
  import('tldraw/tldraw.css');
} catch (e) {
  console.log('[Projects] tldraw loading fallback to canvas notepad');
}

export interface ProjectMember {
  userId: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: 'member' | 'team_lead' | 'line_manager';
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

export interface ProjectTask {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'in-progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  assignedTo: string | null;
  assignedToName: string | null;
  createdBy: string;
  createdByName: string;
  dueDate: string | null;
  createdAt: any;
}

export interface ProjectGridColumn {
  id: string;
  name: string;
  type: 'text' | 'number';
}

export interface ProjectGridRow {
  id: string;
  [key: string]: any;
}

export interface ProjectGridSheet {
  id: string;
  name: string;
  columns: ProjectGridColumn[];
  rows: ProjectGridRow[];
}

export interface ProjectLead {
  id: string;
  projectId: string;
  title: string;
  clientName: string;
  company?: string;
  email?: string;
  phone?: string;
  value: number;
  currency: string;
  stage: 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost';
  assignedTo: string | null;
  assignedToName: string | null;
  notes?: string;
  createdAt: any;
  updatedAt: any;
}

const RichTextWhiteboard: React.FC<{
  value: string;
  onChange: (val: string) => void;
  canEdit: boolean;
}> = ({ value, onChange, canEdit }) => {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || '<p><br></p>';
    }
  }, [value]);

  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const execCmd = (command: string, arg: string = '') => {
    if (!canEdit) return;
    document.execCommand(command, false, arg);
    handleInput();
  };

  return (
    <div className="border border-border rounded-3xl overflow-hidden flex flex-col bg-card shadow-sm h-full min-h-[400px]">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-1.5 p-3 bg-muted/60 border-b border-border">
          <button
            type="button"
            onClick={() => execCmd('bold')}
            className="p-2 rounded-xl hover:bg-muted text-foreground transition-all"
            title="Bold"
          >
            <Bold size={14} />
          </button>
          <button
            type="button"
            onClick={() => execCmd('italic')}
            className="p-2 rounded-xl hover:bg-muted text-foreground transition-all"
            title="Italic"
          >
            <Italic size={14} />
          </button>
          <button
            type="button"
            onClick={() => execCmd('underline')}
            className="p-2 rounded-xl hover:bg-muted text-foreground transition-all"
            title="Underline"
          >
            <Underline size={14} />
          </button>
          <div className="w-px h-4 bg-border mx-1" />
          <button
            type="button"
            onClick={() => execCmd('formatBlock', '<h2>')}
            className="px-2.5 py-1 rounded-xl hover:bg-muted font-black text-xs transition-all"
          >
            H2
          </button>
          <button
            type="button"
            onClick={() => execCmd('formatBlock', '<h3>')}
            className="px-2.5 py-1 rounded-xl hover:bg-muted font-black text-xs transition-all"
          >
            H3
          </button>
          <button
            type="button"
            onClick={() => execCmd('insertUnorderedList')}
            className="p-2 rounded-xl hover:bg-muted text-foreground transition-all"
          >
            <List size={14} />
          </button>
          <button
            type="button"
            onClick={() => execCmd('insertOrderedList')}
            className="p-2 rounded-xl hover:bg-muted text-foreground transition-all"
          >
            <ListOrdered size={14} />
          </button>
        </div>
      )}
      <div
        ref={editorRef}
        contentEditable={canEdit}
        onInput={handleInput}
        className="w-full flex-1 p-6 text-foreground outline-none text-sm font-medium leading-relaxed overflow-y-auto prose prose-sm max-w-none"
      />
    </div>
  );
};

export const Projects: React.FC = () => {
  const { user } = useAuth();
  const { isSidebarHidden, setIsSidebarHidden, config } = useApp();

  useEffect(() => {
    return () => {
      setIsSidebarHidden(false);
    };
  }, [setIsSidebarHidden]);

  const [projects, setProjects] = useState<Project[]>([]);

  const deduplicateProjects = (list: Project[]): Project[] => {
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
  const [invites, setInvites] = useState<ProjectInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'projects' | 'invites'>('projects');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');

  // Selected Project view
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectSubTab, setProjectSubTab] = useState<'overview' | 'tasks' | 'whiteboard' | 'grid' | 'leads' | 'members'>('overview');
  const [whiteboardMode, setWhiteboardMode] = useState<'notes' | 'canvas'>('notes');

  // Tasks in selected project
  const [projectTasks, setProjectTasks] = useState<ProjectTask[]>([]);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [newTaskAssignee, setNewTaskAssignee] = useState<string>('');

  // Invite Member Modal
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmailSearch, setInviteEmailSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedInviteUser, setSelectedInviteUser] = useState<any | null>(null);
  const [inviteRole, setInviteRole] = useState<'member' | 'team_lead' | 'line_manager'>('member');
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);

  // Whiteboard text state
  const [whiteboardHtml, setWhiteboardHtml] = useState('');
  const [isSavingWhiteboard, setIsSavingWhiteboard] = useState(false);

  // Grid Spreadsheet State (Multi-sheet support)
  const defaultSheet: ProjectGridSheet = {
    id: 'sheet_1',
    name: 'Sheet 1',
    columns: [
      { id: 'col_1', name: 'Item / Task', type: 'text' },
      { id: 'col_2', name: 'Category', type: 'text' },
      { id: 'col_3', name: 'Quantity', type: 'number' },
      { id: 'col_4', name: 'Unit Price', type: 'number' },
      { id: 'col_5', name: 'Notes', type: 'text' }
    ],
    rows: [
      { id: 'row_1', col_1: 'UI Design Specs', col_2: 'Design', col_3: '1', col_4: '500', col_5: 'Approved' },
      { id: 'row_2', col_1: 'Backend API Integration', col_2: 'Dev', col_3: '1', col_4: '1200', col_5: 'In Progress' }
    ]
  };

  const [gridSheets, setGridSheets] = useState<ProjectGridSheet[]>([defaultSheet]);
  const [activeSheetId, setActiveSheetId] = useState<string>('sheet_1');
  const [isSavingGrid, setIsSavingGrid] = useState(false);

  const activeSheet = gridSheets.find(s => s.id === activeSheetId) || gridSheets[0] || defaultSheet;

  // Leads / CRM State
  const [projectLeads, setProjectLeads] = useState<ProjectLead[]>([]);
  const [showAddLeadModal, setShowAddLeadModal] = useState(false);
  const [editingLead, setEditingLead] = useState<ProjectLead | null>(null);
  const [newLeadTitle, setNewLeadTitle] = useState('');
  const [newLeadClient, setNewLeadClient] = useState('');
  const [newLeadCompany, setNewLeadCompany] = useState('');
  const [newLeadEmail, setNewLeadEmail] = useState('');
  const [newLeadPhone, setNewLeadPhone] = useState('');
  const [newLeadValue, setNewLeadValue] = useState('');
  const [newLeadCurrency, setNewLeadCurrency] = useState('USD');
  const [newLeadStage, setNewLeadStage] = useState<'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost'>('new');
  const [newLeadAssignee, setNewLeadAssignee] = useState('');
  const [newLeadNotes, setNewLeadNotes] = useState('');

  useEffect(() => {
    if (!user) {
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
              try { localStorage.setItem(`user_projects_${user.uid}`, JSON.stringify(merged)); } catch (e) {}
              return merged;
            });
            setLoading(false);
          }
        }, err => console.warn('[Projects] Firestore snapshot error:', err));
      } catch (e) {
        console.warn('[Projects] Firestore sub error:', e);
      }
    }

    const loadProjectsAndInvites = async () => {
      let projectList: Project[] = [];

      if (isSupabaseConfigured) {
        try {
          // Fetch projects where user is owner or member
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
              try { localStorage.setItem(`user_projects_${user.uid}`, JSON.stringify(merged)); } catch (e) {}
              return merged;
            });
          }
        } catch (e) {
          console.warn('[Projects] Supabase project load error:', e);
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
        } catch (e) {}
      }

      // Fetch pending invites
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
        } catch (e) {}
      }

      setLoading(false);
    };

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

  // Real-time listener for tasks, grid, & leads when project is selected
  useEffect(() => {
    if (!selectedProject) return;

    const loadProjectSubItems = async () => {
      const fsProjId = selectedProject.fsId || selectedProject.id;
      const sbProjId = selectedProject.sbId || selectedProject.id;

      // 1. Fetch tasks from Firestore & Supabase
      const taskMap = new Map<string, ProjectTask>();

      if (db) {
        try {
          const fsTaskSnaps = await getDocs(collection(db, `projects/${fsProjId}/tasks`));
          fsTaskSnaps.forEach(tDoc => {
            const td = tDoc.data();
            taskMap.set(tDoc.id, {
              id: tDoc.id,
              projectId: selectedProject.id,
              title: td.title || '',
              description: td.description || '',
              status: td.status || 'pending',
              priority: td.priority || 'medium',
              assignedTo: td.assignedTo || null,
              assignedToName: td.assignedToName || '',
              createdBy: td.createdBy || user?.uid || '',
              createdByName: td.createdByName || 'User',
              dueDate: td.dueDate || null,
              createdAt: td.createdAt?.toDate?.()?.toISOString() || td.createdAt || new Date().toISOString()
            });
          });

          if (sbProjId !== fsProjId) {
            const fsTaskSnaps2 = await getDocs(collection(db, `projects/${sbProjId}/tasks`));
            fsTaskSnaps2.forEach(tDoc => {
              const td = tDoc.data();
              if (!taskMap.has(tDoc.id)) {
                taskMap.set(tDoc.id, {
                  id: tDoc.id,
                  projectId: selectedProject.id,
                  title: td.title || '',
                  description: td.description || '',
                  status: td.status || 'pending',
                  priority: td.priority || 'medium',
                  assignedTo: td.assignedTo || null,
                  assignedToName: td.assignedToName || '',
                  createdBy: td.createdBy || user?.uid || '',
                  createdByName: td.createdByName || 'User',
                  dueDate: td.dueDate || null,
                  createdAt: td.createdAt?.toDate?.()?.toISOString() || td.createdAt || new Date().toISOString()
                });
              }
            });
          }
        } catch (e) {}
      }

      if (isSupabaseConfigured) {
        try {
          const { data: taskRows } = await supabase
            .from('project_tasks')
            .select('*')
            .or(`project_id.eq.${sbProjId},project_id.eq.${fsProjId}`)
            .order('created_at', { ascending: false });

          (taskRows || []).forEach((t: Record<string, any>) => {
            if (!taskMap.has(t.id)) {
              taskMap.set(t.id, {
                id: t.id,
                projectId: t.project_id,
                title: t.title,
                description: t.description || '',
                status: t.status as any,
                priority: t.priority as any,
                assignedTo: t.assigned_to,
                assignedToName: t.assigned_name,
                createdBy: t.created_by,
                createdByName: 'User',
                dueDate: t.due_date,
                createdAt: t.created_at
              });
            }
          });
        } catch (e) {}
      }

      setProjectTasks(Array.from(taskMap.values()));

      // 2. Fetch Grid sheets from Firestore & Supabase
      let loadedSheets: ProjectGridSheet[] = [];

      if (db) {
        try {
          const gridSnap = await getDocs(collection(db, `projects/${fsProjId}/grid`));
          gridSnap.forEach(gDoc => {
            const gd = gDoc.data();
            if (gd.sheets && Array.isArray(gd.sheets) && gd.sheets.length > 0) {
              loadedSheets = gd.sheets;
            } else if ((gd.columns && Array.isArray(gd.columns)) || (gd.rows && Array.isArray(gd.rows))) {
              loadedSheets.push({
                id: gDoc.id,
                name: gd.name || gd.sheet_name || 'Sheet 1',
                columns: gd.columns || [],
                rows: gd.rows || []
              });
            }
          });
        } catch (e) {}

        if (loadedSheets.length === 0 && sbProjId !== fsProjId) {
          try {
            const gridSnap2 = await getDocs(collection(db, `projects/${sbProjId}/grid`));
            gridSnap2.forEach(gDoc => {
              const gd = gDoc.data();
              if (gd.sheets && Array.isArray(gd.sheets) && gd.sheets.length > 0) {
                loadedSheets = gd.sheets;
              } else if ((gd.columns && Array.isArray(gd.columns)) || (gd.rows && Array.isArray(gd.rows))) {
                loadedSheets.push({
                  id: gDoc.id,
                  name: gd.name || gd.sheet_name || 'Sheet 1',
                  columns: gd.columns || [],
                  rows: gd.rows || []
                });
              }
            });
          } catch (e) {}
        }
      }

      if (loadedSheets.length === 0 && isSupabaseConfigured) {
        try {
          const { data: sheetRows } = await supabase
            .from('grid_sheets')
            .select('*')
            .or(`project_id.eq.${sbProjId},project_id.eq.${fsProjId}`)
            .order('sheet_order', { ascending: true });

          if (sheetRows && sheetRows.length > 0) {
            loadedSheets = sheetRows.map((s: Record<string, any>) => ({
              id: s.id,
              name: s.sheet_name,
              columns: s.columns || [],
              rows: s.rows || []
            }));
          }
        } catch (e) {}
      }

      if (loadedSheets.length === 0) {
        try {
          const rawLocal = localStorage.getItem(`project_grid_sheets_${fsProjId}`) || localStorage.getItem(`project_grid_sheets_${sbProjId}`);
          if (rawLocal) {
            const parsed = JSON.parse(rawLocal);
            if (Array.isArray(parsed) && parsed.length > 0) {
              loadedSheets = parsed;
            }
          }
        } catch (e) {}
      }

      if (loadedSheets.length > 0) {
        loadedSheets = loadedSheets.map(s => {
          if (!s.rows || s.rows.length === 0) {
            const rowObj: ProjectGridRow = { id: `row_${Date.now()}_1` };
            (s.columns || []).forEach(c => { rowObj[c.id] = ''; });
            return { ...s, rows: [rowObj] };
          }
          return s;
        });
        setGridSheets(loadedSheets);
        if (!loadedSheets.some(s => s.id === activeSheetId)) {
          setActiveSheetId(loadedSheets[0].id);
        }
      }

      // 3. Fetch Leads from Firestore & Supabase
      const leadMap = new Map<string, ProjectLead>();

      if (db) {
        try {
          const fsLeadSnaps = await getDocs(collection(db, `projects/${fsProjId}/leads`));
          fsLeadSnaps.forEach(lDoc => {
            const ld = lDoc.data();
            leadMap.set(lDoc.id, {
              id: lDoc.id,
              projectId: selectedProject.id,
              title: ld.title || '',
              clientName: ld.clientName || '',
              company: ld.company || '',
              email: ld.email || '',
              phone: ld.phone || '',
              value: ld.value || 0,
              currency: ld.currency || 'USD',
              stage: ld.stage || 'new',
              assignedTo: ld.assignedTo || null,
              assignedToName: ld.assignedToName || '',
              notes: ld.notes || '',
              createdAt: ld.createdAt?.toDate?.()?.toISOString() || ld.createdAt || new Date().toISOString(),
              updatedAt: ld.updatedAt?.toDate?.()?.toISOString() || ld.updatedAt || new Date().toISOString()
            });
          });

          if (sbProjId !== fsProjId) {
            const fsLeadSnaps2 = await getDocs(collection(db, `projects/${sbProjId}/leads`));
            fsLeadSnaps2.forEach(lDoc => {
              const ld = lDoc.data();
              if (!leadMap.has(lDoc.id)) {
                leadMap.set(lDoc.id, {
                  id: lDoc.id,
                  projectId: selectedProject.id,
                  title: ld.title || '',
                  clientName: ld.clientName || '',
                  company: ld.company || '',
                  email: ld.email || '',
                  phone: ld.phone || '',
                  value: ld.value || 0,
                  currency: ld.currency || 'USD',
                  stage: ld.stage || 'new',
                  assignedTo: ld.assignedTo || null,
                  assignedToName: ld.assignedToName || '',
                  notes: ld.notes || '',
                  createdAt: ld.createdAt?.toDate?.()?.toISOString() || ld.createdAt || new Date().toISOString(),
                  updatedAt: ld.updatedAt?.toDate?.()?.toISOString() || ld.updatedAt || new Date().toISOString()
                });
              }
            });
          }
        } catch (e) {}
      }

      if (isSupabaseConfigured) {
        try {
          const { data: leadRows } = await supabase
            .from('project_leads')
            .select('*')
            .or(`project_id.eq.${sbProjId},project_id.eq.${fsProjId}`)
            .order('created_at', { ascending: false });

          (leadRows || []).forEach((l: Record<string, any>) => {
            if (!leadMap.has(l.id)) {
              leadMap.set(l.id, {
                id: l.id,
                projectId: l.project_id,
                title: l.title,
                clientName: l.client_name,
                company: l.company || '',
                email: l.email || '',
                phone: l.phone || '',
                value: l.value || 0,
                currency: l.currency || 'USD',
                stage: l.stage as any,
                assignedTo: l.assigned_to,
                assignedToName: l.assigned_name,
                notes: l.notes || '',
                createdAt: l.created_at,
                updatedAt: l.updated_at
              });
            }
          });
        } catch (e) {}
      }

      setProjectLeads(Array.from(leadMap.values()));
    };

    loadProjectSubItems();

    if (isSupabaseConfigured) {
      const subChannel = supabase.channel(`project-sub-${selectedProject.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'project_tasks', filter: `project_id=eq.${selectedProject.id}` }, () => loadProjectSubItems())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'grid_sheets', filter: `project_id=eq.${selectedProject.id}` }, () => loadProjectSubItems())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'project_leads', filter: `project_id=eq.${selectedProject.id}` }, () => loadProjectSubItems())
        .subscribe();

      return () => { supabase.removeChannel(subChannel); };
    }
  }, [selectedProject?.id]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newProjectName.trim()) return;

    let projId = `proj_${Date.now()}`;
    const newProjectObj: Project = {
      id: projId,
      name: newProjectName.trim(),
      description: newProjectDesc.trim(),
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

    // 1. Dual-write to Firestore
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
        console.warn('[Projects] Firestore project create error:', e);
      }
    }

    // 2. Dual-write to Supabase
    if (isSupabaseConfigured) {
      try {
        await supabase.from('projects').insert({
          id: projId,
          name: newProjectName.trim(),
          description: newProjectDesc.trim(),
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
    } catch (e) {}

    toast.success('Project created successfully!');
    setShowCreateModal(false);
    setNewProjectName('');
    setNewProjectDesc('');
  };

  const handleAcceptInvite = async (invite: ProjectInvite) => {
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
    } catch (err) {
      console.error(err);
      toast.error('Failed to accept invite');
    }
  };

  const handleDeclineInvite = async (invite: ProjectInvite) => {
    if (!isSupabaseConfigured) return;
    try {
      await supabase.from('project_invites').update({
        status: 'rejected',
        responded_at: new Date().toISOString()
      }).eq('id', invite.id);
      toast.info('Invitation declined');
    } catch (err) {
      console.error(err);
      toast.error('Failed to decline invite');
    }
  };

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

  const handleUpdateMemberRole = async (targetUserId: string, newRole: 'member' | 'team_lead' | 'line_manager') => {
    if (!selectedProject || !isSupabaseConfigured) return;
    try {
      await supabase.from('project_members').update({ role: newRole }).eq('project_id', selectedProject.id).eq('user_id', targetUserId);
      toast.success('Member role updated');
    } catch (e) {
      toast.error('Failed to update role');
    }
  };

  const handleRemoveMember = async (targetUserId: string) => {
    if (!selectedProject || !confirm('Remove this member from the project?') || !isSupabaseConfigured) return;
    try {
      await supabase.from('project_members').delete().eq('project_id', selectedProject.id).eq('user_id', targetUserId);
      toast.success('Member removed');
    } catch (e) {
      toast.error('Failed to remove member');
    }
  };

  const handleCreateProjectTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedProject || !newTaskTitle.trim()) return;

    try {
      let taskId = `task_${Date.now()}`;
      const assigneeObj = selectedProject.members.find((m: { userId: any; }) => m.userId === newTaskAssignee);
      const assigneeName = assigneeObj?.displayName || assigneeObj?.email || null;

      if (db) {
        try {
          const taskRef = doc(collection(db, `projects/${selectedProject.id}/tasks`));
          taskId = taskRef.id;
          await setDoc(taskRef, {
            id: taskId,
            projectId: selectedProject.id,
            title: newTaskTitle.trim(),
            description: newTaskDesc.trim(),
            status: 'pending',
            priority: newTaskPriority,
            assignedTo: newTaskAssignee || null,
            assignedToName: assigneeName,
            createdBy: user.uid,
            createdByName: user.displayName || user.email || 'User',
            createdAt: serverTimestamp()
          });
        } catch (e) {}
      }

      if (isSupabaseConfigured) {
        try {
          await supabase.from('project_tasks').insert({
            id: taskId,
            project_id: selectedProject.id,
            title: newTaskTitle.trim(),
            description: newTaskDesc.trim(),
            status: 'pending',
            priority: newTaskPriority,
            assigned_to: newTaskAssignee || null,
            assigned_name: assigneeName,
            created_by: user.uid
          });
        } catch (e) {}
      }

      if (newTaskAssignee === user.uid) {
        try {
          await addSqliteTask(
            `[${selectedProject.name}] ${newTaskTitle.trim()}`,
            newTaskDesc.trim(),
            'pending',
            null,
            null,
            0,
            5,
            newTaskPriority,
            'Work',
            taskId
          );
        } catch (sqliteErr) {
          console.warn('SQLite task sync warning:', sqliteErr);
        }
      }

      toast.success('Project task created');
      setShowAddTaskModal(false);
      setNewTaskTitle('');
      setNewTaskDesc('');
      setNewTaskAssignee('');
    } catch (e) {
      console.error(e);
      toast.error('Failed to create task');
    }
  };

  const handleToggleTaskStatus = async (task: ProjectTask) => {
    if (!selectedProject) return;
    const nextStatus: 'pending' | 'in-progress' | 'done' =
      task.status === 'pending' ? 'in-progress' : task.status === 'in-progress' ? 'done' : 'pending';

    if (db) {
      try {
        await updateDoc(doc(db, `projects/${selectedProject.id}/tasks`, task.id), {
          status: nextStatus
        });
      } catch (e) {}
    }

    if (isSupabaseConfigured) {
      try {
        await supabase.from('project_tasks').update({
          status: nextStatus,
          updated_at: new Date().toISOString()
        }).eq('id', task.id);
      } catch (e) {}
    }

    toast.success(`Task status updated to ${nextStatus.replace('-', ' ')}`);
  };

  const handleAssignTaskToMe = async (task: ProjectTask, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || !selectedProject) return;

    try {
      const userMemberObj = selectedProject.members.find((m: { userId: any; }) => m.userId === user.uid);
      const assigneeName = userMemberObj?.displayName || user.displayName || user.email || 'You';

      if (db) {
        try {
          await updateDoc(doc(db, `projects/${selectedProject.id}/tasks`, task.id), {
            assignedTo: user.uid,
            assignedToName: assigneeName
          });
        } catch (e) {}
      }

      if (isSupabaseConfigured) {
        try {
          await supabase.from('project_tasks').update({
            assigned_to: user.uid,
            assigned_name: assigneeName,
            updated_at: new Date().toISOString()
          }).eq('id', task.id);
        } catch (e) {}
      }

      try {
        await addSqliteTask(
          `[${selectedProject.name}] ${task.title}`,
          task.description || '',
          task.status === 'done' ? 'completed' : task.status === 'in-progress' ? 'in_progress' : (task.status as 'pending' | 'in_progress' | 'completed'),
          null,
          null,
          0,
          5,
          task.priority,
          'Work',
          task.id
        );
      } catch (sqliteErr) {
        console.warn('SQLite task sync warning:', sqliteErr);
      }

      toast.success('Task assigned to you');
    } catch (err) {
      toast.error('Failed to assign task');
    }
  };

  const handleSaveWhiteboard = async () => {
    if (!selectedProject) return;
    setIsSavingWhiteboard(true);

    if (db) {
      try {
        await updateDoc(doc(db, 'projects', selectedProject.id), {
          whiteboardText: whiteboardHtml,
          updatedAt: serverTimestamp()
        });
      } catch (e) {
        console.warn('[Whiteboard] Firestore save warning:', e);
      }
    }

    if (isSupabaseConfigured) {
      try {
        await supabase.from('projects').update({
          description: whiteboardHtml,
          updated_at: new Date().toISOString()
        }).eq('id', selectedProject.id);
      } catch (e) {}
    }

    setIsSavingWhiteboard(false);
    toast.success('Whiteboard saved!');
  };

  const getCellValue = (row: ProjectGridRow, col: ProjectGridColumn, cIdx?: number): string => {
    if (!row) return '';

    const isNonEmpty = (val: any) => val !== undefined && val !== null && String(val).trim() !== '';

    if (isNonEmpty(row[col.id])) return String(row[col.id]);
    if (isNonEmpty(row[col.name])) return String(row[col.name]);

    if (cIdx !== undefined) {
      const letterUpper = String.fromCharCode(65 + cIdx);
      const letterLower = String.fromCharCode(97 + cIdx);
      const idx1 = cIdx + 1;
      const idx0 = cIdx;

      if (isNonEmpty(row[idx0])) return String(row[idx0]);
      if (isNonEmpty(row[idx1])) return String(row[idx1]);
      if (isNonEmpty(row[`col_${idx1}`])) return String(row[`col_${idx1}`]);
      if (isNonEmpty(row[`col_${idx0}`])) return String(row[`col_${idx0}`]);
      if (isNonEmpty(row[`col${idx1}`])) return String(row[`col${idx1}`]);
      if (isNonEmpty(row[`col${idx0}`])) return String(row[`col${idx0}`]);
      if (isNonEmpty(row[letterUpper])) return String(row[letterUpper]);
      if (isNonEmpty(row[letterLower])) return String(row[letterLower]);
    }

    const colIdLower = (col.id || '').toLowerCase().trim();
    const colNameLower = (col.name || '').toLowerCase().trim();

    for (const k of Object.keys(row)) {
      if (k === 'id') continue;
      const kLower = k.toLowerCase().trim();
      if ((kLower === colIdLower || kLower === colNameLower) && isNonEmpty(row[k])) {
        return String(row[k]);
      }
    }

    // Positional fallback: match by N-th non-id key
    if (cIdx !== undefined) {
      const dataKeys = Object.keys(row).filter(k => k !== 'id');
      if (dataKeys[cIdx] !== undefined && isNonEmpty(row[dataKeys[cIdx]])) {
        return String(row[dataKeys[cIdx]]);
      }
    }

    // Default fallback to col.id or col.name if explicitly present
    if (row[col.id] !== undefined && row[col.id] !== null) return String(row[col.id]);
    if (row[col.name] !== undefined && row[col.name] !== null) return String(row[col.name]);

    return '';
  };

  const handleAddSheet = () => {
    const newSheetId = `sheet_${Date.now()}`;
    const newSheetName = `Sheet ${gridSheets.length + 1}`;
    const newSheet: ProjectGridSheet = {
      id: newSheetId,
      name: newSheetName,
      columns: [
        { id: 'col_1', name: 'Column 1', type: 'text' },
        { id: 'col_2', name: 'Column 2', type: 'text' },
        { id: 'col_3', name: 'Column 3', type: 'number' }
      ],
      rows: [
        { id: `row_${Date.now()}_1`, col_1: '', col_2: '', col_3: '' }
      ]
    };
    const updatedSheets = [...gridSheets, newSheet];
    setGridSheets(updatedSheets);
    setActiveSheetId(newSheetId);
    saveGridToFirestore(updatedSheets);
  };

  const handleRenameSheet = (sheetId: string, newName: string) => {
    const updatedSheets = gridSheets.map(s => s.id === sheetId ? { ...s, name: newName } : s);
    setGridSheets(updatedSheets);
  };

  const handleDeleteSheet = (sheetId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (gridSheets.length <= 1) {
      toast.error('Cannot delete the last sheet');
      return;
    }
    if (!confirm('Delete this sheet?')) return;
    const updatedSheets = gridSheets.filter(s => s.id !== sheetId);
    setGridSheets(updatedSheets);
    if (activeSheetId === sheetId) {
      setActiveSheetId(updatedSheets[0].id);
    }
    saveGridToFirestore(updatedSheets);
  };

  const handleAddGridColumn = () => {
    const newColId = `col_${Date.now()}`;
    const newCol: ProjectGridColumn = {
      id: newColId,
      name: `Column ${activeSheet.columns.length + 1}`,
      type: 'text'
    };
    const updatedCols = [...activeSheet.columns, newCol];
    const updatedRows = activeSheet.rows.map(r => ({ ...r, [newColId]: '', [newCol.name]: '' }));
    const updatedSheets = gridSheets.map(s =>
      s.id === activeSheet.id ? { ...s, columns: updatedCols, rows: updatedRows } : s
    );
    setGridSheets(updatedSheets);
    saveGridToFirestore(updatedSheets);
  };

  const handleRenameColumn = (colId: string, newName: string) => {
    const updatedCols = activeSheet.columns.map(c => c.id === colId ? { ...c, name: newName } : c);
    const updatedSheets = gridSheets.map(s =>
      s.id === activeSheet.id ? { ...s, columns: updatedCols } : s
    );
    setGridSheets(updatedSheets);
  };

  const handleDeleteColumn = (colId: string) => {
    if (activeSheet.columns.length <= 1) {
      toast.error('Cannot delete the last column');
      return;
    }
    const colObj = activeSheet.columns.find(c => c.id === colId);
    const updatedCols = activeSheet.columns.filter(c => c.id !== colId);
    const updatedRows = activeSheet.rows.map(r => {
      const copy = { ...r };
      delete copy[colId];
      if (colObj?.name) delete copy[colObj.name];
      return copy;
    });
    const updatedSheets = gridSheets.map(s =>
      s.id === activeSheet.id ? { ...s, columns: updatedCols, rows: updatedRows } : s
    );
    setGridSheets(updatedSheets);
    saveGridToFirestore(updatedSheets);
  };

  const handleAddGridRow = () => {
    const newRowId = `row_${Date.now()}`;
    const newRow: ProjectGridRow = { id: newRowId };
    activeSheet.columns.forEach(c => {
      newRow[c.id] = '';
      if (c.name) newRow[c.name] = '';
    });
    const updatedRows = [...activeSheet.rows, newRow];
    const updatedSheets = gridSheets.map(s =>
      s.id === activeSheet.id ? { ...s, rows: updatedRows } : s
    );
    setGridSheets(updatedSheets);
    saveGridToFirestore(updatedSheets);
  };

  const handleDeleteGridRow = (rowId: string) => {
    const updatedRows = activeSheet.rows.filter(r => r.id !== rowId);
    const updatedSheets = gridSheets.map(s =>
      s.id === activeSheet.id ? { ...s, rows: updatedRows } : s
    );
    setGridSheets(updatedSheets);
    saveGridToFirestore(updatedSheets);
  };

  const handleCellChange = (rowId: string, colId: string, value: any) => {
    const colObj = activeSheet.columns.find(c => c.id === colId);
    const updatedRows = activeSheet.rows.map(r => {
      if (r.id !== rowId) return r;
      const updated = { ...r, [colId]: value };
      if (colObj?.name) {
        updated[colObj.name] = value;
      }
      return updated;
    });
    const updatedSheets = gridSheets.map(s =>
      s.id === activeSheet.id ? { ...s, rows: updatedRows } : s
    );
    setGridSheets(updatedSheets);
    if (selectedProject) {
      try {
        localStorage.setItem(`project_grid_sheets_${selectedProject.id}`, JSON.stringify(updatedSheets));
      } catch (e) {}
    }
  };

  const saveGridToFirestore = async (sheets: ProjectGridSheet[]) => {
    if (!selectedProject) return;
    const fsProjId = selectedProject.fsId || selectedProject.id;
    const sbProjId = selectedProject.sbId || selectedProject.id;

    try {
      localStorage.setItem(`project_grid_sheets_${selectedProject.id}`, JSON.stringify(sheets));
      localStorage.setItem(`project_grid_sheets_${fsProjId}`, JSON.stringify(sheets));
      localStorage.setItem(`project_grid_sheets_${sbProjId}`, JSON.stringify(sheets));
    } catch (e) {}

    // 1. Dual-write to Firestore
    if (db) {
      try {
        await setDoc(doc(db, `projects/${fsProjId}/grid`, 'main'), {
          sheets: sheets,
          updatedAt: serverTimestamp()
        });
        if (sbProjId !== fsProjId) {
          await setDoc(doc(db, `projects/${sbProjId}/grid`, 'main'), {
            sheets: sheets,
            updatedAt: serverTimestamp()
          });
        }
      } catch (e) {
        console.warn('[Grid] Firestore save warning:', e);
      }
    }

    // 2. Dual-write to Supabase
    if (isSupabaseConfigured) {
      setIsSavingGrid(true);
      try {
        const updatedSheets: ProjectGridSheet[] = [];
        for (let idx = 0; idx < sheets.length; idx++) {
          const sh = sheets[idx];
          const payload: any = {
            project_id: sbProjId,
            sheet_name: sh.name,
            sheet_order: idx,
            columns: sh.columns,
            rows: sh.rows,
            updated_at: new Date().toISOString()
          };

          if (sh.id && !sh.id.startsWith('sheet_')) {
            payload.id = sh.id;
          }

          const { data, error } = await supabase.from('grid_sheets').upsert(payload).select().single();
          if (error) {
            console.error('Grid sheet upsert error:', error);
            updatedSheets.push(sh);
          } else if (data) {
            updatedSheets.push({
              id: data.id,
              name: data.sheet_name,
              columns: data.columns || [],
              rows: data.rows || []
            });
          }
        }

        if (updatedSheets.length > 0) {
          setGridSheets(updatedSheets);
          try {
            localStorage.setItem(`project_grid_sheets_${selectedProject.id}`, JSON.stringify(updatedSheets));
          } catch (e) {}
          if (!updatedSheets.some(s => s.id === activeSheetId)) {
            setActiveSheetId(updatedSheets[0].id);
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsSavingGrid(false);
      }
    }
    toast.success('Grid saved!');
  };

  const exportGridToExcel = (projectName: string, sheets: ProjectGridSheet[]) => {
    const workbook = XLSX.utils.book_new();

    sheets.forEach((sh, idx) => {
      const exportData = sh.rows.map(r => {
        const formatted: any = {};
        sh.columns.forEach((col, colIdx) => {
          formatted[col.name] = getCellValue(r, col, colIdx);
        });
        return formatted;
      });

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const sheetName = (sh.name || `Sheet${idx + 1}`).replace(/[\\/*?:[\]]/g, '').slice(0, 30);
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    });

    XLSX.writeFile(workbook, `${projectName.replace(/\s+/g, '_')}_Spreadsheet.xlsx`);
    toast.success(`Exported ${sheets.length} sheet(s) to Excel!`);
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>, onImport: (sheets: ProjectGridSheet[]) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          toast.error('File contains no sheets');
          return;
        }

        const importedSheets: ProjectGridSheet[] = workbook.SheetNames.map((sheetName, sIdx) => {
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

          if (!jsonData || jsonData.length === 0) {
            return {
              id: `sheet_imp_${Date.now()}_${sIdx}`,
              name: sheetName,
              columns: [{ id: 'col_1', name: 'Column 1', type: 'text' }],
              rows: [{ id: `row_${Date.now()}_${sIdx}_0`, col_1: '', 'Column 1': '' }]
            };
          }

          const headers = jsonData[0] as string[];
          const cols: ProjectGridColumn[] = (headers && headers.length > 0 ? headers : ['Column 1']).map((h, idx) => ({
            id: `col_${idx + 1}`,
            name: String(h || `Column ${idx + 1}`),
            type: 'text'
          }));

          const dataRows = jsonData.slice(1);
          const rows: ProjectGridRow[] = (dataRows.length > 0 ? dataRows : [[]]).map((r, rIdx) => {
            const rowObj: ProjectGridRow = { id: `row_${Date.now()}_${sIdx}_${rIdx}` };
            cols.forEach((col, cIdx) => {
              const cellVal = r && r[cIdx] !== undefined && r[cIdx] !== null ? r[cIdx] : '';
              rowObj[col.id] = cellVal;
              rowObj[col.name] = cellVal;
            });
            return rowObj;
          });

          return {
            id: `sheet_imp_${Date.now()}_${sIdx}`,
            name: sheetName,
            columns: cols,
            rows: rows
          };
        });

        onImport(importedSheets);
        toast.success(`Imported ${importedSheets.length} sheet(s) from Excel!`);
      } catch (err) {
        console.error(err);
        toast.error('Failed to parse Excel file');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // --- Leads / CRM Handlers ---
  const handleSaveLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedProject || !newLeadTitle.trim()) return;

    try {
      const assigneeObj = selectedProject.members.find(m => m.userId === newLeadAssignee);
      const assigneeName = assigneeObj?.displayName || assigneeObj?.email || (newLeadAssignee === user.uid ? (user.displayName || user.email || 'You') : null);

      if (db) {
        try {
          const leadRef = editingLead ? doc(db, `projects/${selectedProject.id}/leads`, editingLead.id) : doc(collection(db, `projects/${selectedProject.id}/leads`));
          await setDoc(leadRef, {
            id: leadRef.id,
            projectId: selectedProject.id,
            title: newLeadTitle.trim(),
            clientName: newLeadClient.trim(),
            company: newLeadCompany.trim() || null,
            email: newLeadEmail.trim() || null,
            phone: newLeadPhone.trim() || null,
            value: parseFloat(newLeadValue) || 0,
            currency: newLeadCurrency.trim() || 'USD',
            stage: newLeadStage,
            assignedTo: newLeadAssignee || null,
            assignedToName: assigneeName,
            notes: newLeadNotes.trim() || null,
            updatedAt: serverTimestamp(),
            ...(editingLead ? {} : { createdAt: serverTimestamp() })
          }, { merge: true });
        } catch (e) {}
      }

      if (isSupabaseConfigured) {
        const leadPayload = {
          project_id: selectedProject.id,
          title: newLeadTitle.trim(),
          client_name: newLeadClient.trim(),
          company: newLeadCompany.trim() || '',
          email: newLeadEmail.trim() || '',
          phone: newLeadPhone.trim() || '',
          value: parseFloat(newLeadValue) || 0,
          currency: newLeadCurrency.trim() || 'PKR',
          stage: newLeadStage,
          assigned_to: newLeadAssignee || null,
          assigned_name: assigneeName,
          notes: newLeadNotes.trim() || '',
          updated_at: new Date().toISOString()
        };

        if (editingLead) {
          await supabase.from('project_leads').update(leadPayload).eq('id', editingLead.id);
        } else {
          await supabase.from('project_leads').insert(leadPayload);
        }
      }

      toast.success(editingLead ? 'Lead updated' : 'Lead added to pipeline');
      setShowAddLeadModal(false);
      setEditingLead(null);
      resetLeadForm();
    } catch (e) {
      console.error(e);
      toast.error('Failed to save lead');
    }
  };

  const handleUpdateLeadStage = async (leadId: string, newStage: 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost') => {
    if (!selectedProject || !isSupabaseConfigured) return;
    try {
      await supabase.from('project_leads').update({
        stage: newStage,
        updated_at: new Date().toISOString()
      }).eq('id', leadId);
      toast.success(`Lead moved to ${newStage.toUpperCase()}`);
    } catch (e) {
      toast.error('Failed to update stage');
    }
  };

  const handleEditLeadClick = (lead: ProjectLead) => {
    setEditingLead(lead);
    setNewLeadTitle(lead.title);
    setNewLeadClient(lead.clientName);
    setNewLeadCompany(lead.company || '');
    setNewLeadEmail(lead.email || '');
    setNewLeadPhone(lead.phone || '');
    setNewLeadValue(lead.value ? String(lead.value) : '0');
    setNewLeadCurrency(lead.currency || 'USD');
    setNewLeadStage(lead.stage || 'new');
    setNewLeadAssignee(lead.assignedTo || '');
    setNewLeadNotes(lead.notes || '');
    setShowAddLeadModal(true);
  };

  const resetLeadForm = () => {
    setNewLeadTitle('');
    setNewLeadClient('');
    setNewLeadCompany('');
    setNewLeadEmail('');
    setNewLeadPhone('');
    setNewLeadValue('');
    setNewLeadCurrency('USD');
    setNewLeadStage('new');
    setNewLeadAssignee('');
    setNewLeadNotes('');
  };

  const LEAD_STAGES = [
    { id: 'new', name: 'New', color: 'border-blue-500/40 text-blue-500 bg-blue-500/10' },
    { id: 'contacted', name: 'Contacted', color: 'border-cyan-500/40 text-cyan-500 bg-cyan-500/10' },
    { id: 'qualified', name: 'Qualified', color: 'border-amber-500/40 text-amber-500 bg-amber-500/10' },
    { id: 'proposal', name: 'Proposal', color: 'border-indigo-500/40 text-indigo-500 bg-indigo-500/10' },
    { id: 'won', name: 'Won 🎉', color: 'border-emerald-500/40 text-emerald-500 bg-emerald-500/10' },
    { id: 'lost', name: 'Lost ❌', color: 'border-rose-500/40 text-rose-500 bg-rose-500/10' }
  ];

  const handleMoveLeadPrev = (lead: ProjectLead) => {
    const idx = LEAD_STAGES.findIndex(s => s.id === lead.stage);
    if (idx > 0) {
      handleUpdateLeadStage(lead.id, LEAD_STAGES[idx - 1].id as any);
    }
  };

  const handleMoveLeadNext = (lead: ProjectLead) => {
    const idx = LEAD_STAGES.findIndex(s => s.id === lead.stage);
    if (idx < LEAD_STAGES.length - 1) {
      handleUpdateLeadStage(lead.id, LEAD_STAGES[idx + 1].id as any);
    }
  };

  const handleDropLead = (e: React.DragEvent, targetStage: string) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('leadId');
    if (leadId) {
      handleUpdateLeadStage(leadId, targetStage as any);
    }
  };

  const handleDeleteLead = async (leadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedProject || !confirm('Delete this lead from pipeline?')) return;
    try {
      if (db) {
        try {
          await deleteDoc(doc(db, `projects/${selectedProject.id}/leads`, leadId));
        } catch (e) {}
      }
      if (isSupabaseConfigured) {
        await supabase.from('project_leads').delete().eq('id', leadId);
      }
      toast.success('Lead deleted');
    } catch (err) {
      toast.error('Failed to delete lead');
    }
  };

  // Helper permission checks
  const currentUserMember = selectedProject?.members.find(m => m.userId === user?.uid);
  const currentRole = currentUserMember?.role || 'member';
  const isTeamLeadOrManager = currentRole === 'team_lead' || currentRole === 'line_manager';

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Selected Project Detail View
  if (selectedProject) {
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-6 rounded-3xl border border-border">
          <div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedProject(null)}
                className="text-xs font-bold text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
              >
                ← Projects
              </button>
              <span className="text-muted-foreground">/</span>
              <h1 className="text-2xl font-extrabold text-foreground">{selectedProject.name}</h1>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase bg-primary/10 text-primary border border-primary/20">
                {currentRole.replace('_', ' ')}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 font-medium">{selectedProject.description}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSidebarHidden(!isSidebarHidden)}
              className="bg-muted hover:bg-muted/80 text-foreground text-xs font-bold px-4 py-2.5 rounded-2xl hover:shadow-md transition-all flex items-center gap-2 border border-border/60"
              title={isSidebarHidden ? "Exit Full Screen" : "Full Screen"}
            >
              {isSidebarHidden ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              <span>{isSidebarHidden ? 'Exit Full Screen' : 'Full Screen'}</span>
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

        {/* Sub-tabs */}
        <div className="flex border-b border-border overflow-x-auto no-scrollbar">
          {[
            { id: 'overview', label: 'Overview', icon: Layout },
            { id: 'tasks', label: `Tasks (${projectTasks.length})`, icon: CheckCircle2 },
            { id: 'whiteboard', label: 'Team Whiteboard', icon: Palette },
            { id: 'grid', label: 'Spreadsheet Grid', icon: Table },
            { id: 'leads', label: `Leads / CRM (${projectLeads.length})`, icon: Briefcase },
            { id: 'members', label: `Team Members (${selectedProject.members.length})`, icon: Users }
          ].map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setProjectSubTab(t.id as any)}
                className={`py-3 px-6 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${projectSubTab === t.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
              >
                <Icon size={16} />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Sub-tab 1: Overview */}
        {projectSubTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
              <div className="bg-card p-6 rounded-3xl border border-border space-y-4">
                <h3 className="font-bold text-base">About Project</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {selectedProject.description || 'No detailed description provided.'}
                </p>
                <div className="flex items-center gap-6 pt-4 border-t border-border/60 text-xs text-muted-foreground">
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-muted-foreground/70">Created By</span>
                    <span className="font-semibold text-foreground">{selectedProject.createdByName}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-muted-foreground/70">Total Tasks</span>
                    <span className="font-semibold text-foreground">{projectTasks.length}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-muted-foreground/70">Active Leads</span>
                    <span className="font-semibold text-primary">{projectLeads.length}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-muted-foreground/70">Completed</span>
                    <span className="font-semibold text-emerald-500">
                      {projectTasks.filter(t => t.status === 'completed').length}
                    </span>
                  </div>
                </div>
              </div>

              {/* Task Quick Summary */}
              <div className="bg-card p-6 rounded-3xl border border-border space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-base">Recent Tasks</h3>
                  <button
                    onClick={() => setProjectSubTab('tasks')}
                    className="text-xs font-bold text-primary hover:underline"
                  >
                    View All →
                  </button>
                </div>
                {projectTasks.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4">No tasks in this project yet.</p>
                ) : (
                  <div className="space-y-2">
                    {projectTasks.slice(0, 4).map(t => (
                      <div
                        key={t.id}
                        onClick={() => handleToggleTaskStatus(t)}
                        className="p-3 bg-muted/40 rounded-2xl border border-border flex items-center justify-between cursor-pointer hover:bg-muted/70 transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <CheckCircle2
                            size={18}
                            className={
                              t.status === 'completed'
                                ? 'text-emerald-500'
                                : t.status === 'in_progress'
                                  ? 'text-blue-500 animate-pulse'
                                  : 'text-muted-foreground'
                            }
                          />
                          <div>
                            <p
                              className={`text-xs font-semibold ${t.status === 'completed' ? 'line-through text-muted-foreground' : 'text-foreground'
                                }`}
                            >
                              {t.title}
                            </p>
                            {t.assignedToName && (
                              <span className="text-[10px] text-muted-foreground">Assigned to: {t.assignedToName}</span>
                            )}
                          </div>
                        </div>
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${t.priority === 'high'
                            ? 'bg-rose-500/10 text-rose-500'
                            : t.priority === 'medium'
                              ? 'bg-amber-500/10 text-amber-500'
                              : 'bg-sky-500/10 text-sky-500'
                            }`}
                        >
                          {t.priority}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar Stats & Members Preview */}
            <div className="space-y-6">
              <div className="bg-card p-6 rounded-3xl border border-border space-y-4">
                <h3 className="font-bold text-base flex items-center gap-2">
                  <Users size={18} className="text-primary" />
                  Team Structure
                </h3>
                <div className="space-y-3">
                  {selectedProject.members.map(m => (
                    <div key={m.userId} className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-foreground">{m.displayName}</p>
                        {(isTeamLeadOrManager || m.userId === user?.uid) && (
                          <p className="text-[10px] text-muted-foreground">{m.email}</p>
                        )}
                      </div>
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${m.role === 'line_manager'
                          ? 'bg-amber-500/10 text-amber-500'
                          : m.role === 'team_lead'
                            ? 'bg-blue-500/10 text-blue-500'
                            : 'bg-muted text-muted-foreground'
                          }`}
                      >
                        {m.role.replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Sub-tab 2: Tasks */}
        {projectSubTab === 'tasks' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base">Project Task Board</h3>
              <button
                onClick={() => setShowAddTaskModal(true)}
                className="bg-primary text-primary-foreground text-xs font-bold px-4 py-2.5 rounded-2xl flex items-center gap-1.5 shadow-md hover:scale-[1.02] transition-all"
              >
                <Plus size={16} />
                New Task
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Pending */}
              <div className="bg-card p-4 rounded-3xl border border-border space-y-3">
                <div className="flex items-center justify-between px-2">
                  <span className="text-xs font-extrabold uppercase text-muted-foreground tracking-wider flex items-center gap-2">
                    <Clock size={14} className="text-amber-500" />
                    Pending ({projectTasks.filter(t => t.status === 'pending').length})
                  </span>
                </div>
                <div className="space-y-2">
                  {projectTasks
                    .filter(t => t.status === 'pending')
                    .map(t => (
                      <div
                        key={t.id}
                        onClick={() => handleToggleTaskStatus(t)}
                        className="p-4 bg-muted/40 hover:bg-muted/70 border border-border rounded-2xl space-y-2 cursor-pointer transition-all"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-bold text-xs text-foreground">{t.title}</h4>
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase bg-amber-500/10 text-amber-500 shrink-0">
                            {t.priority}
                          </span>
                        </div>
                        {t.description && <p className="text-[11px] text-muted-foreground line-clamp-2">{t.description}</p>}
                        <div className="flex items-center justify-between pt-2 border-t border-border/40 text-[10px] text-muted-foreground">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{t.assignedToName ? `👤 ${t.assignedToName}` : 'Unassigned'}</span>
                            {t.assignedTo !== user?.uid && (
                              <button
                                onClick={(e) => handleAssignTaskToMe(t, e)}
                                className="text-[9px] font-bold text-primary hover:underline px-1.5 py-0.5 rounded bg-primary/10 transition-all"
                              >
                                Assign to me
                              </button>
                            )}
                          </div>
                          <span className="font-bold text-primary">Start →</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* In Progress */}
              <div className="bg-card p-4 rounded-3xl border border-border space-y-3">
                <div className="flex items-center justify-between px-2">
                  <span className="text-xs font-extrabold uppercase text-blue-500 tracking-wider flex items-center gap-2">
                    <Activity size={14} />
                    In Progress ({projectTasks.filter(t => t.status === 'in_progress').length})
                  </span>
                </div>
                <div className="space-y-2">
                  {projectTasks
                    .filter(t => t.status === 'in_progress')
                    .map(t => (
                      <div
                        key={t.id}
                        onClick={() => handleToggleTaskStatus(t)}
                        className="p-4 bg-blue-500/5 hover:bg-blue-500/10 border border-blue-500/30 rounded-2xl space-y-2 cursor-pointer transition-all"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-bold text-xs text-foreground">{t.title}</h4>
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase bg-blue-500/20 text-blue-500 shrink-0">
                            {t.priority}
                          </span>
                        </div>
                        {t.description && <p className="text-[11px] text-muted-foreground line-clamp-2">{t.description}</p>}
                        <div className="flex items-center justify-between pt-2 border-t border-blue-500/20 text-[10px] text-muted-foreground">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{t.assignedToName ? `👤 ${t.assignedToName}` : 'Unassigned'}</span>
                            {t.assignedTo !== user?.uid && (
                              <button
                                onClick={(e) => handleAssignTaskToMe(t, e)}
                                className="text-[9px] font-bold text-primary hover:underline px-1.5 py-0.5 rounded bg-primary/10 transition-all"
                              >
                                Assign to me
                              </button>
                            )}
                          </div>
                          <span className="font-bold text-emerald-500">Complete ✓</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Completed */}
              <div className="bg-card p-4 rounded-3xl border border-border space-y-3">
                <div className="flex items-center justify-between px-2">
                  <span className="text-xs font-extrabold uppercase text-emerald-500 tracking-wider flex items-center gap-2">
                    <CheckCircle2 size={14} />
                    Completed ({projectTasks.filter(t => t.status === 'completed').length})
                  </span>
                </div>
                <div className="space-y-2">
                  {projectTasks
                    .filter(t => t.status === 'completed')
                    .map(t => (
                      <div
                        key={t.id}
                        onClick={() => handleToggleTaskStatus(t)}
                        className="p-4 bg-card/60 hover:bg-card border border-border/50 rounded-2xl space-y-2 cursor-pointer transition-all opacity-80"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-bold text-xs line-through text-muted-foreground">{t.title}</h4>
                          <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-border/40 text-[10px] text-muted-foreground">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{t.assignedToName ? `👤 ${t.assignedToName}` : 'Unassigned'}</span>
                            {t.assignedTo !== user?.uid && (
                              <button
                                onClick={(e) => handleAssignTaskToMe(t, e)}
                                className="text-[9px] font-bold text-primary hover:underline px-1.5 py-0.5 rounded bg-primary/10 transition-all"
                              >
                                Assign to me
                              </button>
                            )}
                          </div>
                          <span>Reopen ↺</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Sub-tab 3: Whiteboard */}
        {projectSubTab === 'whiteboard' && (
          <div className="space-y-4 min-h-[500px]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 bg-muted p-1 rounded-2xl border border-border">
                <button
                  onClick={() => setWhiteboardMode('notes')}
                  className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${whiteboardMode === 'notes' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                    }`}
                >
                  Rich Notes Notepad
                </button>
                <button
                  onClick={() => setWhiteboardMode('canvas')}
                  className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${whiteboardMode === 'canvas' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                    }`}
                >
                  Interactive Drawing Canvas
                </button>
              </div>

              {isTeamLeadOrManager && whiteboardMode === 'notes' && (
                <button
                  onClick={handleSaveWhiteboard}
                  disabled={isSavingWhiteboard}
                  className="bg-primary text-primary-foreground text-xs font-bold px-4 py-2 rounded-2xl shadow-md hover:scale-[1.02] transition-all disabled:opacity-50"
                >
                  {isSavingWhiteboard ? 'Saving...' : 'Save Notepad'}
                </button>
              )}
            </div>

            {whiteboardMode === 'notes' ? (
              <RichTextWhiteboard
                value={whiteboardHtml}
                onChange={setWhiteboardHtml}
                canEdit={isTeamLeadOrManager}
              />
            ) : (
              <div className="w-full h-[550px] border border-border rounded-3xl overflow-hidden bg-card relative">
                {TldrawComponent ? (
                  <TldrawComponent licenseKey={config.tldrawLicenseKey || import.meta.env.VITE_TLDRAW_LICENSE_KEY || ''} />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full space-y-4 p-8 text-center">
                    <Palette size={48} className="text-primary animate-pulse" />
                    <h3 className="text-lg font-bold">Interactive Team Canvas</h3>
                    <p className="text-xs text-muted-foreground max-w-sm">
                      Use the Rich Notes Notepad above for formatting text and project guidelines.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Sub-tab 4: Spreadsheet Grid (Multi-sheet) */}
        {projectSubTab === 'grid' && (
          <div className="space-y-4">
            {/* Sheet Tabs Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-3 rounded-3xl border border-border">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {gridSheets.map(s => {
                  const isActive = s.id === activeSheet.id;
                  return (
                    <div
                      key={s.id}
                      onClick={() => setActiveSheetId(s.id)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap border ${isActive
                        ? 'bg-primary/10 text-primary border-primary/30 shadow-sm'
                        : 'bg-muted/40 text-muted-foreground border-transparent hover:bg-muted'
                        }`}
                    >
                      <input
                        type="text"
                        value={s.name}
                        onChange={(e) => handleRenameSheet(s.id, e.target.value)}
                        onBlur={() => saveGridToFirestore(gridSheets)}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-transparent outline-none w-20 font-bold"
                      />
                      {gridSheets.length > 1 && (
                        <button
                          onClick={(e) => handleDeleteSheet(s.id, e)}
                          className="text-muted-foreground hover:text-rose-500 p-0.5 rounded transition-colors"
                          title="Delete Sheet"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  );
                })}

                <button
                  onClick={handleAddSheet}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-muted hover:bg-muted/80 text-foreground transition-all whitespace-nowrap border border-border/50"
                >
                  <Plus size={14} />
                  New Sheet
                </button>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <label className="bg-muted hover:bg-muted/80 text-foreground text-xs font-bold px-3 py-2 rounded-xl cursor-pointer flex items-center gap-1.5 transition-all border border-border/50">
                  <Upload size={14} />
                  Import Excel
                  <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    className="hidden"
                    onChange={(e) => handleImportExcel(e, (importedSheets) => {
                      setGridSheets(importedSheets);
                      if (importedSheets.length > 0) setActiveSheetId(importedSheets[0].id);
                      saveGridToFirestore(importedSheets);
                    })}
                  />
                </label>

                <button
                  onClick={() => exportGridToExcel(selectedProject.name, gridSheets)}
                  className="bg-muted hover:bg-muted/80 text-foreground text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 transition-all border border-border/50"
                >
                  <Download size={14} />
                  Export All Sheets (.xlsx)
                </button>

                <button
                  onClick={() => saveGridToFirestore(gridSheets)}
                  disabled={isSavingGrid}
                  className="bg-primary text-primary-foreground text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-md hover:scale-[1.02] transition-all disabled:opacity-50"
                >
                  <Save size={14} />
                  {isSavingGrid ? 'Saving...' : 'Save Grid'}
                </button>
              </div>
            </div>

            {/* Active Sheet Toolbar */}
            <div className="flex items-center justify-between gap-3 bg-muted/30 p-3 rounded-2xl border border-border text-xs">
              <div className="flex items-center gap-2">
                <Table size={16} className="text-primary" />
                <span className="font-bold text-foreground">{activeSheet.name}</span>
                <span className="text-[10px] text-muted-foreground">({activeSheet.rows.length} rows, {activeSheet.columns.length} columns)</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleAddGridColumn}
                  className="bg-card hover:bg-card/80 text-foreground text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1 transition-all border border-border/60"
                >
                  <Plus size={12} />
                  Add Column
                </button>

                <button
                  onClick={handleAddGridRow}
                  className="bg-card hover:bg-card/80 text-foreground text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1 transition-all border border-border/60"
                >
                  <Plus size={12} />
                  Add Row
                </button>
              </div>
            </div>

            {/* Table View for activeSheet */}
            <div className="border border-border rounded-3xl overflow-x-auto bg-card shadow-sm">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-muted/60 border-b border-border">
                    <th className="p-3 w-10 text-center font-bold text-muted-foreground border-r border-border/40">#</th>
                    {activeSheet.columns.map((col) => (
                      <th key={col.id} className="p-3 font-bold border-r border-border/40 min-w-[140px]">
                        <div className="flex items-center justify-between gap-1">
                          <input
                            type="text"
                            value={col.name}
                            onChange={(e) => handleRenameColumn(col.id, e.target.value)}
                            onBlur={() => saveGridToFirestore(gridSheets)}
                            className="bg-transparent font-bold text-foreground outline-none w-full"
                          />
                          {activeSheet.columns.length > 1 && (
                            <button
                              onClick={() => handleDeleteColumn(col.id)}
                              className="text-muted-foreground hover:text-rose-500 p-1 rounded"
                              title="Delete Column"
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      </th>
                    ))}
                    <th className="p-3 w-12 text-center font-bold text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {activeSheet.rows.map((row, rIdx) => (
                    <tr key={row.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                      <td className="p-3 text-center font-bold text-muted-foreground border-r border-border/40 bg-muted/20">{rIdx + 1}</td>
                      {activeSheet.columns.map((col, colIdx) => (
                        <td key={col.id} className="p-2 border-r border-border/40">
                          <input
                            type={col.type === 'number' ? 'number' : 'text'}
                            value={getCellValue(row, col, colIdx)}
                            onChange={(e) => handleCellChange(row.id, col.id, e.target.value)}
                            placeholder="—"
                            className="w-full bg-transparent p-1.5 outline-none font-medium text-foreground focus:bg-primary/10 rounded-lg transition-all"
                          />
                        </td>
                      ))}
                      <td className="p-2 text-center">
                        <button
                          onClick={() => handleDeleteGridRow(row.id)}
                          className="p-1.5 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"
                          title="Delete Row"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}

                  {/* Column Totals Row */}
                  <tr className="bg-primary/5 font-extrabold border-t-2 border-primary/20">
                    <td className="p-3 text-center text-primary border-r border-border/40">Σ</td>
                    {activeSheet.columns.map((col, colIdx) => {
                      const numericValues = activeSheet.rows
                        .map(r => parseFloat(getCellValue(r, col, colIdx)))
                        .filter(v => !isNaN(v));
                      const hasNumbers = numericValues.length > 0;
                      const sum = hasNumbers ? numericValues.reduce((a, b) => a + b, 0) : null;

                      return (
                        <td key={col.id} className="p-3 border-r border-border/40 text-primary font-bold">
                          {sum !== null ? `Total: ${sum.toLocaleString()}` : ''}
                        </td>
                      );
                    })}
                    <td className="p-3" />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Sub-tab 5: Leads / Sales CRM */}
        {projectSubTab === 'leads' && (
          <div className="space-y-6">
            {/* CRM Metrics Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-card p-4 rounded-3xl border border-border flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                  <Briefcase size={20} />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground">Pipeline Value</p>
                  <p className="text-base font-extrabold text-foreground">
                    {projectLeads.reduce((acc, l) => acc + (Number(l.value) || 0), 0).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="bg-card p-4 rounded-3xl border border-border flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-500">
                  <TrendingUp size={20} />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground">Won Deals</p>
                  <p className="text-base font-extrabold text-emerald-500">
                    {projectLeads
                      .filter(l => l.stage === 'won')
                      .reduce((acc, l) => acc + (Number(l.value) || 0), 0)
                      .toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="bg-card p-4 rounded-3xl border border-border flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-500">
                  <Users size={20} />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground">Active Leads</p>
                  <p className="text-base font-extrabold text-foreground">{projectLeads.length}</p>
                </div>
              </div>

              <div className="bg-card p-4 rounded-3xl border border-border flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-500">
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground">Win Rate</p>
                  <p className="text-base font-extrabold text-foreground">
                    {projectLeads.length > 0
                      ? `${Math.round((projectLeads.filter(l => l.stage === 'won').length / projectLeads.length) * 100)}%`
                      : '0%'}
                  </p>
                </div>
              </div>
            </div>

            {/* Lead Pipeline Board Header */}
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base">Sales Lead Pipeline</h3>
              <button
                onClick={() => {
                  setEditingLead(null);
                  resetLeadForm();
                  setShowAddLeadModal(true);
                }}
                className="bg-primary text-primary-foreground text-xs font-bold px-4 py-2.5 rounded-2xl flex items-center gap-1.5 shadow-md hover:scale-[1.02] transition-all"
              >
                <Plus size={16} />
                Add Lead / Deal
              </button>
            </div>

            {/* 6 Stage Kanban Pipeline Board */}
            <div className="flex overflow-x-auto gap-4 pb-6 min-h-[550px] scrollbar-thin">
              {LEAD_STAGES.map((stage, sIdx) => {
                const stageLeads = projectLeads.filter(l => l.stage === stage.id);
                const stageValue = stageLeads.reduce((acc, l) => acc + (Number(l.value) || 0), 0);

                return (
                  <div
                    key={stage.id}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleDropLead(e, stage.id)}
                    className="bg-card p-4 rounded-3xl border border-border flex flex-col min-w-[270px] flex-1 min-h-[500px]"
                  >
                    <div className="flex items-center justify-between pb-3 border-b border-border mb-3">
                      <span className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full ${stage.color}`}>
                        {stage.name} ({stageLeads.length})
                      </span>
                      <span className="text-[10px] font-bold text-muted-foreground">
                        {stageValue > 0 ? stageValue.toLocaleString() : ''}
                      </span>
                    </div>

                    <div className="flex-1 flex flex-col gap-2.5">
                      {stageLeads.length === 0 ? (
                        <div className="flex-1 min-h-[150px] flex items-center justify-center border border-dashed border-border/60 rounded-2xl bg-muted/10 p-4">
                          <p className="text-[10px] text-muted-foreground font-semibold">Drop lead here</p>
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {stageLeads.map(lead => (
                            <div
                              key={lead.id}
                              draggable
                              onDragStart={(e) => e.dataTransfer.setData('leadId', lead.id)}
                              className="p-3.5 bg-muted/40 hover:bg-muted/70 border border-border/80 hover:border-primary/40 rounded-2xl space-y-2.5 transition-all shadow-sm cursor-grab active:cursor-grabbing group"
                            >
                              <div className="flex items-start justify-between gap-1">
                                <h4 className="font-bold text-xs text-foreground group-hover:text-primary transition-colors">
                                  {lead.title}
                                </h4>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    onClick={() => handleEditLeadClick(lead)}
                                    className="text-muted-foreground hover:text-primary p-1 rounded-lg hover:bg-muted"
                                    title="Edit Lead"
                                  >
                                    <Edit2 size={12} />
                                  </button>
                                  <button
                                    onClick={(e) => handleDeleteLead(lead.id, e)}
                                    className="text-muted-foreground hover:text-rose-500 p-1 rounded-lg hover:bg-rose-500/10"
                                    title="Delete Lead"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>

                              <div className="space-y-0.5">
                                <p className="text-[11px] font-semibold text-foreground">{lead.clientName}</p>
                                {lead.company && (
                                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                    <Building2 size={10} /> {lead.company}
                                  </p>
                                )}
                              </div>

                              <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px]">
                                <span className="font-extrabold text-emerald-500">
                                  {lead.currency} {lead.value ? lead.value.toLocaleString() : 0}
                                </span>
                                {lead.assignedToName && (
                                  <span className="text-[9px] text-muted-foreground font-medium">👤 {lead.assignedToName}</span>
                                )}
                              </div>

                              {/* Kanban Move Arrows & Quick Stage Dropdown */}
                              <div className="flex items-center justify-between pt-1 text-[10px] border-t border-border/30">
                                <button
                                  disabled={sIdx === 0}
                                  onClick={() => handleMoveLeadPrev(lead)}
                                  className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                                  title="Move to previous stage"
                                >
                                  <ChevronLeft size={14} />
                                </button>

                                <select
                                  value={lead.stage}
                                  onChange={(e) => handleUpdateLeadStage(lead.id, e.target.value as any)}
                                  className="bg-card border border-border text-[9px] font-bold py-0.5 px-1.5 rounded-lg outline-none cursor-pointer"
                                >
                                  {LEAD_STAGES.map(st => (
                                    <option key={st.id} value={st.id}>
                                      {st.name}
                                    </option>
                                  ))}
                                </select>

                                <button
                                  disabled={sIdx === LEAD_STAGES.length - 1}
                                  onClick={() => handleMoveLeadNext(lead)}
                                  className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                                  title="Move to next stage"
                                >
                                  <ChevronRight size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Sub-tab 6: Members */}
        {projectSubTab === 'members' && (
          <div className="bg-card p-6 rounded-3xl border border-border space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base">Project Team Members</h3>
                <p className="text-xs text-muted-foreground">Manage roles, invites, and team access.</p>
              </div>
              {isTeamLeadOrManager && (
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="bg-primary text-primary-foreground text-xs font-bold px-4 py-2.5 rounded-2xl flex items-center gap-1.5"
                >
                  <UserPlus size={16} />
                  Invite Member
                </button>
              )}
            </div>

            <div className="space-y-3">
              {selectedProject.members.map(m => (
                <div key={m.userId} className="p-4 bg-muted/40 rounded-2xl border border-border flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                      {m.displayName ? m.displayName.charAt(0).toUpperCase() : 'U'}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-foreground flex items-center gap-2">
                        {m.displayName}
                        {m.status === 'invited' && (
                          <span className="text-[9px] bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded-full font-bold">
                            INVITED
                          </span>
                        )}
                      </p>
                      {(isTeamLeadOrManager || m.userId === user?.uid) && (
                        <p className="text-[10px] text-muted-foreground">{m.email}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {isTeamLeadOrManager && m.userId !== user?.uid ? (
                      <select
                        value={m.role}
                        onChange={(e) => handleUpdateMemberRole(m.userId, e.target.value as any)}
                        className="bg-card border border-border text-xs font-bold p-2 rounded-xl outline-none"
                      >
                        <option value="member">Member</option>
                        <option value="team_lead">Team Lead</option>
                        <option value="line_manager">Line Manager</option>
                      </select>
                    ) : (
                      <span className="text-xs font-extrabold uppercase text-muted-foreground">
                        {m.role.replace('_', ' ')}
                      </span>
                    )}

                    {isTeamLeadOrManager && m.userId !== user?.uid && (
                      <button
                        onClick={() => handleRemoveMember(m.userId)}
                        className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"
                        title="Remove member"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modal: Add Project Task */}
        {showAddTaskModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card w-full max-w-md rounded-3xl p-6 border border-border space-y-4 animate-in zoom-in-95">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base">New Project Task</h3>
                <button onClick={() => setShowAddTaskModal(false)} className="text-muted-foreground hover:bg-muted p-2 rounded-full">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreateProjectTask} className="space-y-4">
                <div>
                  <label className="text-xs font-bold block mb-1">Task Title</label>
                  <input
                    type="text"
                    required
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="E.g. Review UI Mocks"
                    className="w-full bg-muted border border-border rounded-2xl p-3 text-xs outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold block mb-1">Description</label>
                  <textarea
                    value={newTaskDesc}
                    onChange={(e) => setNewTaskDesc(e.target.value)}
                    placeholder="Task details..."
                    className="w-full bg-muted border border-border rounded-2xl p-3 text-xs outline-none focus:ring-2 focus:ring-primary h-20 resize-none"
                  />
                </div>

                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="text-xs font-bold block mb-1">Priority</label>
                    <select
                      value={newTaskPriority}
                      onChange={(e) => setNewTaskPriority(e.target.value as any)}
                      className="w-full bg-muted border border-border rounded-2xl p-3 text-xs outline-none font-bold"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold block">Assign To</label>
                      {user && (
                        <button
                          type="button"
                          onClick={() => setNewTaskAssignee(user.uid)}
                          className="text-[10px] font-bold text-primary hover:underline"
                        >
                          Assign to me
                        </button>
                      )}
                    </div>
                    <select
                      value={newTaskAssignee}
                      onChange={(e) => setNewTaskAssignee(e.target.value)}
                      className="w-full bg-muted border border-border rounded-2xl p-3 text-xs outline-none font-bold"
                    >
                      <option value="">Unassigned</option>
                      {user && (
                        <option value={user.uid}>
                          👤 Assign to Me ({user.displayName || 'You'})
                        </option>
                      )}
                      {selectedProject.members
                        .filter(m => m.userId !== user?.uid)
                        .map(m => (
                          <option key={m.userId} value={m.userId}>
                            {m.displayName}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAddTaskModal(false)}
                    className="flex-1 py-3 bg-muted rounded-2xl text-xs font-bold"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="flex-1 py-3 bg-primary text-primary-foreground rounded-2xl text-xs font-bold">
                    Create Task
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Add/Edit Lead */}
        {showAddLeadModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card w-full max-w-md rounded-3xl p-6 border border-border space-y-4 animate-in zoom-in-95">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base">{editingLead ? 'Edit Lead / Deal' : 'Add New Lead / Deal'}</h3>
                <button onClick={() => setShowAddLeadModal(false)} className="text-muted-foreground hover:bg-muted p-2 rounded-full">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveLead} className="space-y-4">
                <div>
                  <label className="text-xs font-bold block mb-1">Deal / Lead Title</label>
                  <input
                    type="text"
                    required
                    placeholder="E.g. Web App Development Deal"
                    value={newLeadTitle}
                    onChange={(e) => setNewLeadTitle(e.target.value)}
                    className="w-full bg-muted border border-border rounded-2xl p-3 text-xs outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs font-bold block mb-1">Client Name</label>
                    <input
                      type="text"
                      required
                      placeholder="John Doe"
                      value={newLeadClient}
                      onChange={(e) => setNewLeadClient(e.target.value)}
                      className="w-full bg-muted border border-border rounded-2xl p-3 text-xs outline-none"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-bold block mb-1">Company (Optional)</label>
                    <input
                      type="text"
                      placeholder="Acme Corp"
                      value={newLeadCompany}
                      onChange={(e) => setNewLeadCompany(e.target.value)}
                      className="w-full bg-muted border border-border rounded-2xl p-3 text-xs outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex-[2]">
                    <label className="text-xs font-bold block mb-1">Deal Value</label>
                    <input
                      type="number"
                      placeholder="50000"
                      value={newLeadValue}
                      onChange={(e) => setNewLeadValue(e.target.value)}
                      className="w-full bg-muted border border-border rounded-2xl p-3 text-xs outline-none font-bold"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-bold block mb-1">Currency</label>
                    <input
                      type="text"
                      value={newLeadCurrency}
                      onChange={(e) => setNewLeadCurrency(e.target.value)}
                      className="w-full bg-muted border border-border rounded-2xl p-3 text-xs outline-none font-bold"
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs font-bold block mb-1">Email</label>
                    <input
                      type="email"
                      placeholder="client@acme.com"
                      value={newLeadEmail}
                      onChange={(e) => setNewLeadEmail(e.target.value)}
                      className="w-full bg-muted border border-border rounded-2xl p-3 text-xs outline-none"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-bold block mb-1">Phone</label>
                    <input
                      type="text"
                      placeholder="+1 234 567 890"
                      value={newLeadPhone}
                      onChange={(e) => setNewLeadPhone(e.target.value)}
                      className="w-full bg-muted border border-border rounded-2xl p-3 text-xs outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs font-bold block mb-1">Pipeline Stage</label>
                    <select
                      value={newLeadStage}
                      onChange={(e) => setNewLeadStage(e.target.value as any)}
                      className="w-full bg-muted border border-border rounded-2xl p-3 text-xs outline-none font-bold"
                    >
                      <option value="new">New</option>
                      <option value="contacted">Contacted</option>
                      <option value="qualified">Qualified</option>
                      <option value="proposal">Proposal</option>
                      <option value="won">Won 🎉</option>
                      <option value="lost">Lost ❌</option>
                    </select>
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold block">Assignee</label>
                      {user && (
                        <button
                          type="button"
                          onClick={() => setNewLeadAssignee(user.uid)}
                          className="text-[10px] font-bold text-primary hover:underline"
                        >
                          Assign to me
                        </button>
                      )}
                    </div>
                    <select
                      value={newLeadAssignee}
                      onChange={(e) => setNewLeadAssignee(e.target.value)}
                      className="w-full bg-muted border border-border rounded-2xl p-3 text-xs outline-none font-bold"
                    >
                      <option value="">Unassigned</option>
                      {user && (
                        <option value={user.uid}>
                          👤 Assign to Me ({user.displayName || 'You'})
                        </option>
                      )}
                      {selectedProject.members
                        .filter(m => m.userId !== user?.uid)
                        .map(m => (
                          <option key={m.userId} value={m.userId}>
                            {m.displayName}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold block mb-1">Notes</label>
                  <textarea
                    value={newLeadNotes}
                    onChange={(e) => setNewLeadNotes(e.target.value)}
                    placeholder="Key discussion points, requirements..."
                    className="w-full bg-muted border border-border rounded-2xl p-3 text-xs outline-none h-20 resize-none"
                  />
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAddLeadModal(false)}
                    className="flex-1 py-3 bg-muted rounded-2xl text-xs font-bold"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="flex-1 py-3 bg-primary text-primary-foreground rounded-2xl text-xs font-bold">
                    {editingLead ? 'Update Lead' : 'Create Lead'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Invite Team Member */}
        {showInviteModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card w-full max-w-md rounded-3xl p-6 border border-border space-y-4 animate-in zoom-in-95">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base">Invite Member to Project</h3>
                <button onClick={() => setShowInviteModal(false)} className="text-muted-foreground hover:bg-muted p-2 rounded-full">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold block mb-1">Search User by Email</label>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={inviteEmailSearch}
                      onChange={(e) => setInviteEmailSearch(e.target.value)}
                      placeholder="user@example.com"
                      className="flex-1 bg-muted border border-border rounded-2xl p-3 text-xs outline-none"
                    />
                    <button
                      onClick={handleSearchUsers}
                      disabled={isSearchingUsers}
                      className="bg-muted px-4 py-3 rounded-2xl text-xs font-bold hover:bg-muted/80"
                    >
                      Search
                    </button>
                  </div>
                </div>

                {searchResults.length > 0 && (
                  <div className="max-h-40 overflow-y-auto space-y-2 border border-border p-2 rounded-2xl bg-muted/20">
                    {searchResults.map(u => (
                      <div
                        key={u.id}
                        onClick={() => setSelectedInviteUser(u)}
                        className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer text-xs ${selectedInviteUser?.id === u.id
                          ? 'border-primary bg-primary/10 text-primary font-bold'
                          : 'border-border bg-card'
                          }`}
                      >
                        <div>
                          <p className="font-bold">{u.displayName || 'App User'}</p>
                          <p className="text-[10px] text-muted-foreground">{u.email}</p>
                        </div>
                        {selectedInviteUser?.id === u.id && <Check size={14} />}
                      </div>
                    ))}
                  </div>
                )}

                <div>
                  <label className="text-xs font-bold block mb-1">Select Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as any)}
                    className="w-full bg-muted border border-border rounded-2xl p-3 text-xs font-bold outline-none"
                  >
                    <option value="member">Member (View & work on tasks)</option>
                    <option value="team_lead">Team Lead (Edit whiteboard & assign tasks)</option>
                    <option value="line_manager">Line Manager (Full Project Admin)</option>
                  </select>
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="flex-1 py-3 bg-muted rounded-2xl text-xs font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!selectedInviteUser}
                    onClick={handleSendInvite}
                    className="flex-1 py-3 bg-primary text-primary-foreground rounded-2xl text-xs font-bold disabled:opacity-50"
                  >
                    Send In-App Invite
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Projects Main Dashboard List
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            Projects & Teams Management
            <FolderKanban className="text-primary" size={24} />
          </h1>
          <p className="text-muted-foreground mt-1 text-sm font-medium">
            Collaborate with teams, assign tasks, and share real-time whiteboards.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-primary text-primary-foreground py-3 px-5 rounded-2xl shadow-lg hover:shadow-primary/20 hover:scale-[1.02] transition-all flex items-center gap-2 font-semibold text-sm"
        >
          <Plus size={18} />
          <span>New Project</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab('projects')}
          className={`py-3 px-6 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${activeTab === 'projects'
            ? 'border-primary text-primary'
            : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
        >
          My Projects
          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary">{projects.length}</span>
        </button>

        <button
          onClick={() => setActiveTab('invites')}
          className={`py-3 px-6 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${activeTab === 'invites'
            ? 'border-primary text-primary'
            : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
        >
          Pending Invites
          {invites.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary font-bold animate-pulse">
              {invites.length}
            </span>
          )}
        </button>
      </div>

      {/* Projects Tab */}
      {activeTab === 'projects' && (
        <>
          {projects.length === 0 ? (
            <div className="py-20 text-center border border-dashed border-border rounded-3xl bg-card space-y-4">
              <div className="w-16 h-16 bg-primary/10 text-primary rounded-3xl flex items-center justify-center mx-auto">
                <FolderKanban size={32} />
              </div>
              <h3 className="font-bold text-base">No Projects Joined</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Create a new project or accept an in-app invite from a team lead to start collaborating.
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="bg-primary text-primary-foreground font-bold text-xs px-5 py-3 rounded-2xl"
              >
                Create First Project
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map(p => {
                const userMemberObj = p.members?.find(m => m.userId === user?.uid);
                const roleName = userMemberObj?.role || 'member';

                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedProject(p)}
                    className="bg-card p-6 rounded-3xl border border-border hover:border-primary/50 hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col justify-between space-y-4 group"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                          <FolderKanban size={22} />
                        </div>
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase bg-muted text-muted-foreground border">
                          {roleName.replace('_', ' ')}
                        </span>
                      </div>

                      <h3 className="font-bold text-base text-foreground group-hover:text-primary transition-colors">
                        {p.name}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                        {p.description || 'No description provided.'}
                      </p>
                    </div>

                    <div className="pt-4 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users size={14} />
                        {p.members?.length || 1} members
                      </span>
                      <span className="font-bold text-primary group-hover:translate-x-1 transition-transform flex items-center gap-1">
                        Open Project <ChevronRight size={14} />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Invites Tab */}
      {activeTab === 'invites' && (
        <div className="space-y-3">
          {invites.length === 0 ? (
            <div className="py-16 text-center border border-dashed border-border rounded-3xl bg-card">
              <p className="text-xs text-muted-foreground font-semibold">No pending project invitations.</p>
            </div>
          ) : (
            invites.map(inv => (
              <div
                key={inv.id}
                className="p-5 bg-card border border-border rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div>
                  <h4 className="font-extrabold text-sm text-foreground">{inv.projectName}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Invited by <strong className="text-foreground">{inv.invitedByName}</strong> to join as{' '}
                    <span className="font-bold text-primary uppercase">{inv.role.replace('_', ' ')}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDeclineInvite(inv)}
                    className="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground text-xs font-bold rounded-2xl"
                  >
                    Decline
                  </button>
                  <button
                    onClick={() => handleAcceptInvite(inv)}
                    className="px-4 py-2 bg-primary text-primary-foreground text-xs font-bold rounded-2xl shadow-md"
                  >
                    Accept & Join
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Modal: Create Project */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-md rounded-3xl p-6 border border-border space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base">Create New Project</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-muted-foreground hover:bg-muted p-2 rounded-full">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="text-xs font-bold block mb-1">Project Name</label>
                <input
                  type="text"
                  required
                  placeholder="E.g. Mobile App Redesign"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full bg-muted border border-border rounded-2xl p-3.5 text-xs outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="text-xs font-bold block mb-1">Description</label>
                <textarea
                  placeholder="Outline the project goals and objectives..."
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  className="w-full bg-muted border border-border rounded-2xl p-3.5 text-xs outline-none focus:ring-2 focus:ring-primary h-24 resize-none"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-3 bg-muted rounded-2xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button type="submit" className="flex-1 py-3 bg-primary text-primary-foreground rounded-2xl text-xs font-bold">
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Projects;
