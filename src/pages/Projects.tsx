import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp
} from 'firebase/firestore';
import {
  FolderKanban,
  Plus,
  Users,
  UserPlus,
  CheckCircle2,
  Clock,
  Trash2,
  ChevronRight,
  X,
  Check,
  Sparkles,
  Layout,
  Palette,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered
} from 'lucide-react';
import { toast } from 'sonner';
import { addTask as addSqliteTask } from '../db/queries';

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
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  assignedTo: string | null;
  assignedToName: string | null;
  createdBy: string;
  createdByName: string;
  dueDate: string | null;
  createdAt: any;
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
  const [projects, setProjects] = useState<Project[]>([]);
  const [invites, setInvites] = useState<ProjectInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'projects' | 'invites'>('projects');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');

  // Selected Project view
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectSubTab, setProjectSubTab] = useState<'overview' | 'tasks' | 'whiteboard' | 'members'>('overview');
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

  useEffect(() => {
    if (!user) return;

    // Listen to projects where user is a member
    const qProjects = collection(db, 'projects');
    const unsubProjects = onSnapshot(qProjects, (snapshot) => {
      const allList = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as Project));

      // Filter projects where user.uid is in members list
      const userProjects = allList.filter(p =>
        p.members && p.members.some(m => m.userId === user.uid && m.status === 'active')
      );
      setProjects(userProjects);
      setLoading(false);
    });

    // Listen to pending invites for current user
    const qInvites = query(
      collection(db, 'project_invites'),
      where('invitedUserId', '==', user.uid),
      where('status', '==', 'pending')
    );
    const unsubInvites = onSnapshot(qInvites, (snapshot) => {
      const list = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as ProjectInvite));
      setInvites(list);
    });

    return () => {
      unsubProjects();
      unsubInvites();
    };
  }, [user]);

  // Real-time listener for tasks & whiteboard when project is selected
  useEffect(() => {
    if (!selectedProject) return;

    // Refresh selected project details
    const unsubProjDoc = onSnapshot(doc(db, 'projects', selectedProject.id), (docSnap) => {
      if (docSnap.exists()) {
        const updated = { id: docSnap.id, ...docSnap.data() } as Project;
        setSelectedProject(updated);
        setWhiteboardHtml(updated.whiteboardText || '');
      }
    });

    // Listen to project tasks
    const qTasks = query(
      collection(db, `projects/${selectedProject.id}/tasks`),
      orderBy('createdAt', 'desc')
    );
    const unsubTasks = onSnapshot(qTasks, (snapshot) => {
      const list = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as ProjectTask));
      setProjectTasks(list);
    });

    return () => {
      unsubProjDoc();
      unsubTasks();
    };
  }, [selectedProject?.id]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newProjectName.trim()) return;

    try {
      const projectRef = doc(collection(db, 'projects'));
      const newProjData: Project = {
        id: projectRef.id,
        name: newProjectName.trim(),
        description: newProjectDesc.trim(),
        createdBy: user.uid,
        createdByName: user.displayName || user.email || 'Admin',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        status: 'active',
        whiteboardText: `<h2>${newProjectName} - Whiteboard</h2><p>Welcome! Team Lead can post notes, milestones, and instructions here.</p>`,
        members: [
          {
            userId: user.uid,
            email: user.email || '',
            displayName: user.displayName || user.email || 'Owner',
            photoURL: user.photoURL || '',
            role: 'line_manager',
            joinedAt: new Date().toISOString(),
            status: 'active'
          }
        ]
      };

      await setDoc(projectRef, newProjData);
      toast.success('Project created successfully!');
      setShowCreateModal(false);
      setNewProjectName('');
      setNewProjectDesc('');
      setSelectedProject(newProjData);
    } catch (err) {
      console.error(err);
      toast.error('Failed to create project');
    }
  };

  const handleAcceptInvite = async (invite: ProjectInvite) => {
    if (!user) return;
    try {
      const projRef = doc(db, 'projects', invite.projectId);
      const projSnap = await getDoc(projRef);

      if (projSnap.exists()) {
        const projData = projSnap.data() as Project;
        const existingMembers = projData.members || [];
        
        const updatedMembers = existingMembers.map(m =>
          m.userId === user.uid ? { ...m, status: 'active' as const } : m
        );

        if (!updatedMembers.some(m => m.userId === user.uid)) {
          updatedMembers.push({
            userId: user.uid,
            email: user.email || '',
            displayName: user.displayName || user.email || 'User',
            photoURL: user.photoURL || '',
            role: invite.role,
            joinedAt: new Date().toISOString(),
            status: 'active'
          });
        }

        await updateDoc(projRef, { members: updatedMembers });
      }

      // Update invite status
      await updateDoc(doc(db, 'project_invites', invite.id), {
        status: 'accepted',
        respondedAt: serverTimestamp()
      });

      toast.success(`Joined project ${invite.projectName}!`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to accept invite');
    }
  };

  const handleDeclineInvite = async (invite: ProjectInvite) => {
    try {
      await updateDoc(doc(db, 'project_invites', invite.id), {
        status: 'declined',
        respondedAt: serverTimestamp()
      });
      toast.info('Invitation declined');
    } catch (err) {
      console.error(err);
      toast.error('Failed to decline invite');
    }
  };

  const handleSearchUsers = async () => {
    if (!inviteEmailSearch.trim()) return;
    setIsSearchingUsers(true);
    try {
      const snap = await getDocs(collection(db, 'registered_users'));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const term = inviteEmailSearch.trim().toLowerCase();
      const filtered = list.filter((u: any) =>
        u.email?.toLowerCase().includes(term) || u.displayName?.toLowerCase().includes(term)
      );
      setSearchResults(filtered);
    } catch (e) {
      console.error(e);
      toast.error('User search failed');
    } finally {
      setIsSearchingUsers(false);
    }
  };

  const handleSendInvite = async () => {
    if (!user || !selectedProject || !selectedInviteUser) return;
    try {
      // Check if already in project
      if (selectedProject.members.some(m => m.userId === selectedInviteUser.id)) {
        toast.error('User is already a member or invited to this project');
        return;
      }

      const inviteRef = doc(collection(db, 'project_invites'));
      const inviteData: ProjectInvite = {
        id: inviteRef.id,
        projectId: selectedProject.id,
        projectName: selectedProject.name,
        invitedBy: user.uid,
        invitedByName: user.displayName || user.email || 'Team Lead',
        invitedUserId: selectedInviteUser.id,
        invitedUserEmail: selectedInviteUser.email,
        role: inviteRole,
        status: 'pending',
        createdAt: serverTimestamp()
      };

      await setDoc(inviteRef, inviteData);

      // Add to project members list as 'invited'
      const updatedMembers = [
        ...selectedProject.members,
        {
          userId: selectedInviteUser.id,
          email: selectedInviteUser.email,
          displayName: selectedInviteUser.displayName || selectedInviteUser.email,
          photoURL: selectedInviteUser.photoURL || '',
          role: inviteRole,
          joinedAt: new Date().toISOString(),
          status: 'invited' as const
        }
      ];

      await updateDoc(doc(db, 'projects', selectedProject.id), {
        members: updatedMembers
      });

      // Send in-app notification
      await addDoc(collection(db, `users/${selectedInviteUser.id}/notifications`), {
        message: `You have been invited to join project "${selectedProject.name}" as ${inviteRole.replace('_', ' ')}!`,
        timestamp: serverTimestamp(),
        read: false
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
    if (!selectedProject) return;
    try {
      const updatedMembers = selectedProject.members.map(m =>
        m.userId === targetUserId ? { ...m, role: newRole } : m
      );
      await updateDoc(doc(db, 'projects', selectedProject.id), { members: updatedMembers });
      toast.success('Member role updated');
    } catch (e) {
      toast.error('Failed to update role');
    }
  };

  const handleRemoveMember = async (targetUserId: string) => {
    if (!selectedProject || !confirm('Remove this member from the project?')) return;
    try {
      const updatedMembers = selectedProject.members.filter(m => m.userId !== targetUserId);
      await updateDoc(doc(db, 'projects', selectedProject.id), { members: updatedMembers });
      toast.success('Member removed');
    } catch (e) {
      toast.error('Failed to remove member');
    }
  };

  const handleCreateProjectTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedProject || !newTaskTitle.trim()) return;

    try {
      const taskRef = doc(collection(db, `projects/${selectedProject.id}/tasks`));
      const assigneeObj = selectedProject.members.find(m => m.userId === newTaskAssignee);

      const taskData: ProjectTask = {
        id: taskRef.id,
        projectId: selectedProject.id,
        title: newTaskTitle.trim(),
        description: newTaskDesc.trim(),
        status: 'pending',
        priority: newTaskPriority,
        assignedTo: newTaskAssignee || null,
        assignedToName: assigneeObj?.displayName || assigneeObj?.email || null,
        createdBy: user.uid,
        createdByName: user.displayName || user.email || 'User',
        dueDate: null,
        createdAt: serverTimestamp()
      };

      await setDoc(taskRef, taskData);

      // If assigned to current user, also add to local SQLite task manager with project_id
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
            taskRef.id
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
    const nextStatus: 'pending' | 'in_progress' | 'completed' =
      task.status === 'pending' ? 'in_progress' : task.status === 'in_progress' ? 'completed' : 'pending';

    try {
      await updateDoc(doc(db, `projects/${selectedProject.id}/tasks`, task.id), {
        status: nextStatus
      });
      toast.success(`Task status updated to ${nextStatus.replace('_', ' ')}`);
    } catch (e) {
      toast.error('Failed to update status');
    }
  };

  const handleSaveWhiteboard = async () => {
    if (!selectedProject) return;
    setIsSavingWhiteboard(true);
    try {
      await updateDoc(doc(db, 'projects', selectedProject.id), {
        whiteboardText: whiteboardHtml,
        updatedAt: serverTimestamp()
      });
      toast.success('Whiteboard saved!');
    } catch (e) {
      toast.error('Failed to save whiteboard');
    } finally {
      setIsSavingWhiteboard(false);
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
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase bg-violet-500/10 text-violet-500 border border-violet-500/20">
                {currentRole.replace('_', ' ')}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 font-medium">{selectedProject.description}</p>
          </div>

          <div className="flex items-center gap-2">
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
            { id: 'members', label: `Team Members (${selectedProject.members.length})`, icon: Users }
          ].map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setProjectSubTab(t.id as any)}
                className={`py-3 px-6 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
                  projectSubTab === t.id
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
                              className={`text-xs font-semibold ${
                                t.status === 'completed' ? 'line-through text-muted-foreground' : 'text-foreground'
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
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            t.priority === 'high'
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
                  <Users size={18} className="text-violet-500" />
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
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          m.role === 'line_manager'
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
                          <span>{t.assignedToName ? `👤 ${t.assignedToName}` : 'Unassigned'}</span>
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
                    <Sparkles size={14} />
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
                          <span>{t.assignedToName ? `👤 ${t.assignedToName}` : 'Unassigned'}</span>
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
                          <span>{t.assignedToName ? `👤 ${t.assignedToName}` : 'Unassigned'}</span>
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
                  className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    whiteboardMode === 'notes' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                  }`}
                >
                  Rich Notes Notepad
                </button>
                <button
                  onClick={() => setWhiteboardMode('canvas')}
                  className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    whiteboardMode === 'canvas' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
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
                  <TldrawComponent />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full space-y-4 p-8 text-center">
                    <Palette size={48} className="text-violet-500 animate-bounce" />
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

        {/* Sub-tab 4: Members */}
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
                    <label className="text-xs font-bold block mb-1">Assign To</label>
                    <select
                      value={newTaskAssignee}
                      onChange={(e) => setNewTaskAssignee(e.target.value)}
                      className="w-full bg-muted border border-border rounded-2xl p-3 text-xs outline-none font-bold"
                    >
                      <option value="">Unassigned</option>
                      {selectedProject.members.map(m => (
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
                        className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer text-xs ${
                          selectedInviteUser?.id === u.id
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
            <FolderKanban className="text-violet-500" size={24} />
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
          className={`py-3 px-6 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'projects'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          My Projects
          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary">{projects.length}</span>
        </button>

        <button
          onClick={() => setActiveTab('invites')}
          className={`py-3 px-6 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'invites'
              ? 'border-violet-500 text-violet-500'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Pending Invites
          {invites.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-500 font-bold animate-pulse">
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
              <div className="w-16 h-16 bg-violet-500/10 text-violet-500 rounded-3xl flex items-center justify-center mx-auto">
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
                        <div className="p-3 rounded-2xl bg-violet-500/10 text-violet-500">
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
                    <span className="font-bold text-violet-500 uppercase">{inv.role.replace('_', ' ')}</span>
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
