import React, { useEffect, useState } from 'react';
import { useWork } from '../../contexts/WorkContext';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../firebase';
import { supabase, isSupabaseConfigured } from '../../supabase';
import { collection, doc, getDocs, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { addTask as addSqliteTask } from '../../db/queries';
import {
  CheckCircle2,
  Plus,
  Clock,
  User,
  AlertCircle,
  Filter,
  Check,
  Play,
  Pause,
  Trash2,
  Sparkles
} from 'lucide-react';
import { toast } from 'sonner';

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

export const ProjectTasks: React.FC = () => {
  const { selectedProject } = useWork();
  const { user } = useAuth();

  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [newTaskAssignee, setNewTaskAssignee] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => {
    if (!selectedProject) return;

    const loadTasks = async () => {
      const taskMap = new Map<string, ProjectTask>();
      const fsProjId = selectedProject.fsId || selectedProject.id;
      const sbProjId = selectedProject.sbId || selectedProject.id;

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
        } catch (e) { }
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
        } catch (e) { }
      }

      setTasks(Array.from(taskMap.values()));
      setLoading(false);
    };

    loadTasks();
  }, [selectedProject, user]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedProject || !newTaskTitle.trim()) return;

    try {
      let taskId = `task_${Date.now()}`;
      const assigneeObj = selectedProject.members?.find((m: { userId: any; }) => m.userId === newTaskAssignee);
      const assigneeName = assigneeObj?.displayName || assigneeObj?.email || null;

      const newTaskObj: ProjectTask = {
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
        dueDate: null,
        createdAt: new Date().toISOString()
      };

      if (db) {
        try {
          const taskRef = doc(collection(db, `projects/${selectedProject.id}/tasks`));
          taskId = taskRef.id;
          newTaskObj.id = taskId;
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
        } catch (e) { }
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
        } catch (e) { }
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
        } catch (sqliteErr) { }
      }

      setTasks(prev => [newTaskObj, ...prev]);
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

  const handleToggleStatus = async (task: ProjectTask) => {
    if (!selectedProject) return;
    const nextStatus: 'pending' | 'in-progress' | 'done' =
      task.status === 'pending' ? 'in-progress' : task.status === 'in-progress' || task.status === 'in_progress' ? 'done' : 'pending';

    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: nextStatus } : t));

    if (db) {
      try {
        await updateDoc(doc(db, `projects/${selectedProject.id}/tasks`, task.id), {
          status: nextStatus
        });
      } catch (e) { }
    }

    if (isSupabaseConfigured) {
      try {
        await supabase.from('project_tasks').update({
          status: nextStatus,
          updated_at: new Date().toISOString()
        }).eq('id', task.id);
      } catch (e) { }
    }

    toast.success(`Task status updated to ${nextStatus.replace('-', ' ')}`);
  };

  const handleAssignToMe = async (task: ProjectTask, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || !selectedProject) return;

    const userMemberObj = selectedProject.members?.find((m: { userId: any; }) => m.userId === user.uid);
    const assigneeName = userMemberObj?.displayName || user.displayName || user.email || 'You';

    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, assignedTo: user.uid, assignedToName: assigneeName } : t));

    if (db) {
      try {
        await updateDoc(doc(db, `projects/${selectedProject.id}/tasks`, task.id), {
          assignedTo: user.uid,
          assignedToName: assigneeName
        });
      } catch (e) { }
    }

    if (isSupabaseConfigured) {
      try {
        await supabase.from('project_tasks').update({
          assigned_to: user.uid,
          assigned_name: assigneeName,
          updated_at: new Date().toISOString()
        }).eq('id', task.id);
      } catch (e) { }
    }

    try {
      await addSqliteTask(
        `[${selectedProject.name}] ${task.title}`,
        task.description || '',
        task.status === 'done' || task.status === 'completed' ? 'completed' : task.status === 'in-progress' || task.status === 'in_progress' ? 'in_progress' : 'pending',
        null,
        null,
        0,
        5,
        task.priority,
        'Work',
        task.id
      );
    } catch (sqliteErr) { }

    toast.success('Task assigned to you');
  };

  const filteredTasks = tasks.filter(t => {
    if (filterStatus === 'pending') return t.status === 'pending';
    if (filterStatus === 'in_progress') return t.status === 'in-progress' || t.status === 'in_progress';
    if (filterStatus === 'completed') return t.status === 'done' || t.status === 'completed';
    return true;
  });

  if (!selectedProject) return null;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-foreground flex items-center gap-2">
            <CheckCircle2 className="text-primary" size={20} /> Project Tasks
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage team task assignments, progress statuses, and sync to personal todo lists.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="bg-card border border-border rounded-xl px-3 py-2 text-xs font-semibold outline-none"
          >
            <option value="all">All Tasks ({tasks.length})</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>

          <button
            onClick={() => setShowAddTaskModal(true)}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm"
          >
            <Plus size={16} /> New Task
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="py-12 text-center border border-dashed border-border rounded-3xl bg-card">
          <CheckCircle2 size={32} className="text-muted-foreground mx-auto mb-2" />
          <p className="text-xs text-muted-foreground font-semibold">No tasks found for this project.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTasks.map(t => {
            const isDone = t.status === 'done' || t.status === 'completed';
            const isInProgress = t.status === 'in-progress' || t.status === 'in_progress';

            return (
              <div
                key={t.id}
                onClick={() => handleToggleStatus(t)}
                className={`bg-card p-5 rounded-3xl border shadow-xs transition-all cursor-pointer flex flex-col justify-between ${
                  isDone
                    ? 'border-border/50 bg-card/60'
                    : isInProgress
                    ? 'border-blue-500/40 ring-1 ring-blue-500/20'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                      t.priority === 'high' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' :
                      t.priority === 'medium' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
                      'bg-sky-500/10 text-sky-500 border border-sky-500/20'
                    }`}>
                      {t.priority} priority
                    </span>

                    <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                      isDone ? 'bg-emerald-500/10 text-emerald-500' :
                      isInProgress ? 'bg-blue-500/10 text-blue-500' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {isDone ? 'Done' : isInProgress ? 'In Progress' : 'Pending'}
                    </span>
                  </div>

                  <h3 className={`font-bold text-sm ${isDone ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                    {t.title}
                  </h3>
                  {t.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</p>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1 text-[11px]">
                    <User size={12} />
                    <span className="font-semibold">{t.assignedToName || 'Unassigned'}</span>
                  </div>

                  {t.assignedTo !== user?.uid && (
                    <button
                      onClick={e => handleAssignToMe(t, e)}
                      className="text-[10px] font-bold text-primary hover:underline"
                    >
                      Assign to me
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Task Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-md rounded-3xl p-6 border border-border shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg">Add Project Task</h3>
              <button onClick={() => setShowAddTaskModal(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="block text-xs font-bold mb-1">Task Title</label>
                <input
                  type="text"
                  required
                  placeholder="Task title..."
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1">Description</label>
                <textarea
                  placeholder="Details..."
                  value={newTaskDesc}
                  onChange={e => setNewTaskDesc(e.target.value)}
                  className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary resize-none h-20"
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-bold mb-1">Priority</label>
                  <select
                    value={newTaskPriority}
                    onChange={e => setNewTaskPriority(e.target.value as any)}
                    className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-xs outline-none"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div className="flex-1">
                  <label className="block text-xs font-bold mb-1">Assignee</label>
                  <select
                    value={newTaskAssignee}
                    onChange={e => setNewTaskAssignee(e.target.value)}
                    className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-xs outline-none"
                  >
                    <option value="">Unassigned</option>
                    {selectedProject.members?.map(m => (
                      <option key={m.userId} value={m.userId}>{m.displayName || m.email}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddTaskModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-border"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-primary text-primary-foreground"
                >
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
