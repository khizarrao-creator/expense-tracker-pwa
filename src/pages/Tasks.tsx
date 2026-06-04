import React, { useEffect, useState } from 'react';
import { getTasks, addTask, updateTask, deleteTask, getTaskLogs, addTaskLog } from '../db/queries';
import type { Task, TaskLog } from '../db/queries';
import {
  Plus,
  Trash2,
  Calendar,
  Circle,
  CheckCircle2,
  Clock,
  Bell,
  Search,
  Edit2,
  Play,
  Pause,
  AlertCircle,
  Sparkles,
  MessageSquare,
  History,
  Timer,
  X
} from 'lucide-react';
import { toast } from 'sonner';

const CATEGORIES = ['Personal', 'Work', 'Financial', 'Shopping', 'Others'];

const getCategoryStyles = (category: string | null | undefined) => {
  switch (category?.toLowerCase()) {
    case 'work':
      return 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/20';
    case 'personal':
      return 'bg-blue-500/10 text-blue-500 border border-blue-500/20';
    case 'financial':
      return 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20';
    case 'shopping':
      return 'bg-rose-500/10 text-rose-500 border border-rose-500/20';
    default:
      return 'bg-slate-500/10 text-slate-500 border border-slate-500/20';
  }
};

const getPriorityStyles = (priority: 'low' | 'medium' | 'high' | string | null | undefined) => {
  switch (priority) {
    case 'high':
      return 'bg-rose-500/10 text-rose-500 border border-rose-500/20';
    case 'medium':
      return 'bg-amber-500/10 text-amber-500 border border-amber-500/20';
    case 'low':
      return 'bg-sky-500/10 text-sky-500 border border-sky-500/20';
    default:
      return 'bg-slate-500/10 text-slate-500 border border-slate-500/20';
  }
};

const isOverdue = (task: Task) => {
  if (task.status === 'completed' || !task.due_date) return false;
  
  const dueDateTimeStr = task.due_time 
    ? `${task.due_date}T${task.due_time}`
    : `${task.due_date}T23:59:59`;
    
  return new Date(dueDateTimeStr) < new Date();
};

const formatDuration = (totalSeconds: number) => {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const ActiveTimer: React.FC<{ task: Task }> = ({ task }) => {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (task.status !== 'in_progress' || !task.last_started_at) {
      setSeconds(task.time_spent || 0);
      return;
    }

    const calculateElapsed = () => {
      const elapsed = Math.floor((Date.now() - new Date(task.last_started_at!).getTime()) / 1000);
      setSeconds((task.time_spent || 0) + elapsed);
    };

    calculateElapsed();
    const interval = setInterval(calculateElapsed, 1000);
    return () => clearInterval(interval);
  }, [task.status, task.time_spent, task.last_started_at]);

  return <span>{formatDuration(seconds)}</span>;
};

const getLogIcon = (type: string) => {
  switch (type) {
    case 'start':
    case 'resume':
      return <Play className="text-blue-500 fill-blue-500/20" size={12} />;
    case 'pause':
      return <Pause className="text-amber-500 fill-amber-500/20" size={12} />;
    case 'complete':
      return <CheckCircle2 className="text-emerald-500" size={12} />;
    case 'reopen':
      return <History className="text-indigo-500" size={12} />;
    default:
      return <MessageSquare className="text-sky-500" size={12} />;
  }
};

const getLogTitle = (log: TaskLog) => {
  switch (log.type) {
    case 'start':
      return 'Task Started';
    case 'resume':
      return 'Task Resumed';
    case 'pause':
      return `Task Paused (${formatDuration(log.duration)})`;
    case 'complete':
      return log.duration > 0 ? `Task Completed (Total Tracked: ${formatDuration(log.duration)})` : 'Task Completed';
    case 'reopen':
      return 'Task Reopened';
    default:
      return 'Progress Update';
  }
};

const isDefaultSystemNote = (notes: string | null | undefined) => {
  if (!notes) return true;
  const n = notes.trim().toLowerCase();
  return (
    n === 'task created' ||
    n === 'task started' ||
    n === 'task resumed' ||
    n === 'task paused' ||
    n === 'task completed' ||
    n === 'task reopened'
  );
};

const Tasks: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Detail Modal States
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [taskLogs, setTaskLogs] = useState<TaskLog[]>([]);
  const [newLogNote, setNewLogNote] = useState('');
  const [isAddingLog, setIsAddingLog] = useState(false);

  // Search, Filter, Sort States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'due_date' | 'priority' | 'created_at' | 'title'>('due_date');
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'in_progress' | 'completed'>('pending');

  // Add Task Form State
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newDueTime, setNewDueTime] = useState('');
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [newCategory, setNewCategory] = useState('Personal');
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderOffset, setReminderOffset] = useState(5);

  // Edit Task Form State
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editDueTime, setEditDueTime] = useState('');
  const [editPriority, setEditPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [editCategory, setEditCategory] = useState('Personal');
  const [editReminderEnabled, setEditReminderEnabled] = useState(false);
  const [editReminderOffset, setEditReminderOffset] = useState(5);

  useEffect(() => {
    loadData();
    window.addEventListener('app-sync-complete', loadData);
    return () => window.removeEventListener('app-sync-complete', loadData);
  }, []);

  const loadData = async () => {
    try {
      const tasksList = await getTasks();
      setTasks(tasksList);
    } catch (error) {
      console.error('Failed to load tasks', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      await addTask(
        newTitle.trim(),
        newDescription,
        'pending',
        newDueDate || null,
        newDueTime || null,
        reminderEnabled ? 1 : 0,
        reminderOffset,
        newPriority,
        newCategory,
        crypto.randomUUID()
      );
      toast.success('Task added successfully');
      setShowAddModal(false);
      resetAddForm();
      loadData();
    } catch (error) {
      toast.error('Failed to add task');
    }
  };

  const handleEditClick = (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTask(task);
    setEditTitle(task.title);
    setEditDescription(task.description || '');
    setEditDueDate(task.due_date || '');
    setEditDueTime(task.due_time || '');
    setEditPriority(task.priority || 'medium');
    setEditCategory(task.category || 'Personal');
    setEditReminderEnabled(task.reminder_enabled === 1);
    setEditReminderOffset(task.reminder_offset ?? 5);
    setShowEditModal(true);
  };

  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !editTitle.trim()) return;

    try {
      await updateTask(editingTask.id, {
        title: editTitle.trim(),
        description: editDescription,
        due_date: editDueDate || null,
        due_time: editDueTime || null,
        priority: editPriority,
        category: editCategory,
        reminder_enabled: editReminderEnabled ? 1 : 0,
        reminder_offset: editReminderOffset,
        // Reset reminder sent status if date/time or status changes
        reminder_sent: (editingTask.due_date !== editDueDate || editingTask.due_time !== editDueTime) ? 0 : editingTask.reminder_sent
      });
      toast.success('Task updated successfully');
      setShowEditModal(false);
      setEditingTask(null);
      loadData();
    } catch (error) {
      toast.error('Failed to update task');
    }
  };

  const handleDeleteTask = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      await deleteTask(id);
      toast.success('Task deleted');
      loadData();
    } catch (error) {
      toast.error('Failed to delete task');
    }
  };

  const handleStatusToggle = async (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const newStatus = task.status === 'completed' ? 'pending' : 'completed';
      await updateTask(task.id, { status: newStatus });
      toast.success(newStatus === 'completed' ? 'Task completed! 🎉' : 'Task marked as pending');
      loadData();
      if (detailTask && detailTask.id === task.id) {
        await refreshDetailTask(task.id);
      }
    } catch (error) {
      toast.error('Failed to update task status');
    }
  };

  const handleStatusChange = async (task: Task, newStatus: 'pending' | 'in_progress' | 'completed', e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await updateTask(task.id, { status: newStatus });
      toast.success(`Task marked as ${newStatus.replace('_', ' ')}`);
      loadData();
      if (detailTask && detailTask.id === task.id) {
        await refreshDetailTask(task.id);
      }
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const resetAddForm = () => {
    setNewTitle('');
    setNewDescription('');
    setNewDueDate('');
    setNewDueTime('');
    setNewPriority('medium');
    setNewCategory('Personal');
    setReminderEnabled(false);
    setReminderOffset(5);
  };

  const handleOpenDetailModal = async (task: Task) => {
    setDetailTask(task);
    setShowDetailModal(true);
    await loadTaskLogs(task.id);
  };

  const loadTaskLogs = async (taskId: string) => {
    try {
      const logs = await getTaskLogs(taskId);
      setTaskLogs(logs);
    } catch (error) {
      console.error('Failed to load task logs', error);
    }
  };

  const handleAddLogNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailTask || !newLogNote.trim()) return;
    setIsAddingLog(true);

    try {
      await addTaskLog(detailTask.id, 'update', newLogNote.trim(), 0);
      toast.success('Progress update added');
      setNewLogNote('');
      await loadTaskLogs(detailTask.id);
    } catch (error) {
      toast.error('Failed to add progress update');
    } finally {
      setIsAddingLog(false);
    }
  };

  const refreshDetailTask = async (taskId: string) => {
    const tasksList = await getTasks();
    setTasks(tasksList);
    const updated = tasksList.find(t => t.id === taskId);
    if (updated) {
      setDetailTask(updated);
    }
    await loadTaskLogs(taskId);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Count helper functions for Tab labels
  const allCount = tasks.length;
  const pendingCount = tasks.filter(t => t.status === 'pending').length;
  const inProgressCount = tasks.filter(t => t.status === 'in_progress').length;
  const completedCount = tasks.filter(t => t.status === 'completed').length;

  // Filter tasks based on search query, priority and status tab
  const filteredTasks = tasks.filter(task => {
    const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          task.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesTab = activeTab === 'all' || 
                       (activeTab === 'pending' && task.status === 'pending') ||
                       (activeTab === 'in_progress' && task.status === 'in_progress') ||
                       (activeTab === 'completed' && task.status === 'completed');
    
    const matchesPriority = filterPriority === 'all' || task.priority === filterPriority;
    
    return matchesSearch && matchesTab && matchesPriority;
  });

  // Sort tasks
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    if (sortBy === 'due_date') {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      const dateA = new Date(`${a.due_date}T${a.due_time || '00:00'}`);
      const dateB = new Date(`${b.due_date}T${b.due_time || '00:00'}`);
      return dateA.getTime() - dateB.getTime();
    }
    if (sortBy === 'priority') {
      const priorityWeight = { high: 3, medium: 2, low: 1 };
      const weightA = priorityWeight[a.priority || 'medium'] || 0;
      const weightB = priorityWeight[b.priority || 'medium'] || 0;
      return weightB - weightA;
    }
    if (sortBy === 'title') {
      return a.title.localeCompare(b.title);
    }
    if (sortBy === 'created_at') {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
    return 0;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            Task Manager
            <Sparkles className="text-primary animate-pulse" size={20} />
          </h1>
          <p className="text-muted-foreground mt-1 font-medium text-sm">Organize your daily activities, milestones, and to-dos.</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-primary text-primary-foreground py-3 px-4 rounded-2xl shadow-lg hover:shadow-primary/20 hover:scale-[1.02] transition-all flex items-center gap-2 font-semibold text-sm"
        >
          <Plus size={18} />
          <span>New Task</span>
        </button>
      </div>

      {/* Search, Filter, Sort Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Search */}
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-card border border-border rounded-2xl py-3.5 pl-11 pr-4 focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-sm transition-all"
          />
        </div>

        {/* Priority Filter */}
        <div>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="w-full bg-card border border-border rounded-2xl py-3.5 px-4 focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-sm transition-all cursor-pointer"
          >
            <option value="all">All Priorities</option>
            <option value="high">🔥 High Priority</option>
            <option value="medium">⚡ Medium Priority</option>
            <option value="low">🌊 Low Priority</option>
          </select>
        </div>

        {/* Sorting option */}
        <div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="w-full bg-card border border-border rounded-2xl py-3.5 px-4 focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-sm transition-all cursor-pointer"
          >
            <option value="due_date">🗓️ Sort: Due Date</option>
            <option value="priority">🔥 Sort: Priority</option>
            <option value="created_at">🆕 Sort: Newest</option>
            <option value="title">🔤 Sort: Title (A-Z)</option>
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border overflow-x-auto no-scrollbar scroll-smooth">
        <button
          onClick={() => setActiveTab('pending')}
          className={`py-3 px-6 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'pending'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Pending
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            activeTab === 'pending' ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
          }`}>{pendingCount}</span>
        </button>
        <button
          onClick={() => setActiveTab('in_progress')}
          className={`py-3 px-6 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'in_progress'
              ? 'border-blue-500 text-blue-500'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          In Progress
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            activeTab === 'in_progress' ? 'bg-blue-500/20 text-blue-500' : 'bg-muted text-muted-foreground'
          }`}>{inProgressCount}</span>
        </button>
        <button
          onClick={() => setActiveTab('completed')}
          className={`py-3 px-6 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'completed'
              ? 'border-emerald-500 text-emerald-500'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Completed
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            activeTab === 'completed' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-muted text-muted-foreground'
          }`}>{completedCount}</span>
        </button>
        <button
          onClick={() => setActiveTab('all')}
          className={`py-3 px-6 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'all'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          All
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            activeTab === 'all' ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
          }`}>{allCount}</span>
        </button>
      </div>

      {/* Task Cards list */}
      {sortedTasks.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-border rounded-3xl bg-card">
          <div className="bg-muted p-4 rounded-2xl mb-4 inline-block">
            <CheckCircle2 size={32} className="text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm font-semibold">No tasks found. Try adjusting your filter or create a new task!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedTasks.map(task => {
            const completed = task.status === 'completed';
            const inProgress = task.status === 'in_progress';
            const overdue = isOverdue(task);
            
            return (
              <div
                key={task.id}
                onClick={() => handleOpenDetailModal(task)}
                  className={`bg-card p-5 rounded-3xl shadow-sm border group relative transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                    completed
                      ? 'border-border/40 bg-card/60 hover:border-emerald-500/30'
                      : inProgress
                      ? 'border-blue-500/40 shadow-blue-500/5 hover:border-blue-500 ring-1 ring-blue-500/20'
                      : overdue
                      ? 'border-rose-500/40 hover:border-rose-500 shadow-rose-500/5'
                      : 'border-border hover:border-primary/50 hover:shadow-md'
                  }`}
                >
                  {/* Status Indicator Pulse for In Progress */}
                  {inProgress && (
                    <span className="absolute top-3 right-3 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                    </span>
                  )}

                  <div>
                    {/* Actions Header */}
                    <div className="flex items-center justify-between mb-3.5 pr-8">
                      {/* Status badges */}
                      <div className="flex gap-2 flex-wrap">
                        {task.category && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getCategoryStyles(task.category)}`}>
                            {task.category}
                          </span>
                        )}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getPriorityStyles(task.priority)}`}>
                          {task.priority ? task.priority.toUpperCase() : 'MEDIUM'}
                        </span>
                        {overdue && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500 text-white animate-pulse flex items-center gap-1">
                            <AlertCircle size={10} />
                            OVERDUE
                          </span>
                        )}
                      </div>

                      {/* Edit/Delete icons */}
                      <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-card/90 rounded-lg p-0.5 backdrop-blur-sm shadow-sm">
                        <button
                          onClick={(e) => handleEditClick(task, e)}
                          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                          title="Edit Task"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={(e) => handleDeleteTask(task.id, e)}
                          className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted rounded-md transition-colors"
                          title="Delete Task"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Title & Description */}
                    <div className="flex gap-3 mb-4">
                      <div 
                        onClick={(e) => handleStatusToggle(task, e)}
                        className="mt-1 flex-shrink-0 cursor-pointer hover:scale-105 active:scale-95 transition-transform"
                      >
                        {completed ? (
                          <CheckCircle2 size={20} className="text-emerald-500 transition-colors" />
                        ) : (
                          <Circle size={20} className="text-muted-foreground hover:text-primary transition-colors" />
                        )}
                      </div>
                      <div>
                        <h3 className={`font-semibold text-sm ${completed ? 'line-through text-muted-foreground/60' : 'text-foreground'}`}>
                          {task.title}
                        </h3>
                        {task.description && (
                          <p className={`text-xs mt-1.5 line-clamp-2 leading-relaxed ${completed ? 'text-muted-foreground/40' : 'text-muted-foreground'}`}>
                            {task.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Footer Controls */}
                  <div className="mt-2 pt-3.5 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      {task.due_date && (
                        <span className={`flex items-center ${overdue ? 'text-rose-500 font-bold' : completed ? 'text-muted-foreground/50' : 'text-foreground/80'}`}>
                          <Calendar size={12} className="mr-1" />
                          {new Date(task.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                      {task.due_time && (
                        <span className={`flex items-center ${completed ? 'text-muted-foreground/50' : 'text-foreground/70'}`}>
                          <Clock size={12} className="mr-1" />
                          {task.due_time}
                        </span>
                      )}
                      {task.reminder_enabled === 1 && (
                        <div title="Reminder active" className="flex items-center">
                          <Bell size={12} className={task.reminder_sent === 1 ? "text-muted-foreground/30" : "text-primary"} />
                        </div>
                      )}
                      {((task.time_spent && task.time_spent > 0) || inProgress) && (
                        <span className={`flex items-center gap-1 font-semibold px-2 py-0.5 rounded-lg border ${
                          inProgress 
                            ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' 
                            : 'bg-muted text-muted-foreground border-border/50'
                        }`}>
                          <Clock size={10} />
                          {inProgress ? <ActiveTimer task={task} /> : formatDuration(task.time_spent || 0)}
                        </span>
                      )}
                    </div>

                    {/* Transition button */}
                    {!completed && (
                      <div className="z-10 flex gap-1">
                        {inProgress ? (
                          <button
                            onClick={(e) => handleStatusChange(task, 'pending', e)}
                            className="flex items-center gap-1 bg-muted hover:bg-muted/80 text-foreground text-[10px] font-bold px-2 py-1 rounded-lg transition-colors border border-border"
                          >
                            <Pause size={10} />
                            Pause
                          </button>
                        ) : (
                          <button
                            onClick={(e) => handleStatusChange(task, 'in_progress', e)}
                            className="flex items-center gap-1 bg-blue-500/10 text-blue-500 border border-blue-500/20 hover:bg-blue-500 hover:text-white text-[10px] font-bold px-2 py-1 rounded-lg transition-all"
                          >
                            <Play size={10} />
                            Start
                          </button>
                        )}
                      </div>
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
          <div className="bg-card w-full max-w-md rounded-3xl shadow-2xl p-6 border border-border animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">Add Task</h2>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  resetAddForm();
                }}
                className="text-muted-foreground hover:bg-muted p-2 rounded-full transition-colors"
              >
                <Plus size={18} className="rotate-45" />
              </button>
            </div>

            <form onSubmit={handleAddTask} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5 ml-1">Title</label>
                <input
                  type="text"
                  required
                  placeholder="What needs to be done?"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-muted border border-transparent rounded-2xl p-3.5 text-sm focus:ring-2 focus:ring-primary focus:bg-card focus:border-transparent outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5 ml-1">Description (Optional)</label>
                <textarea
                  placeholder="Provide some details..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full bg-muted border border-transparent rounded-2xl p-3.5 text-sm focus:ring-2 focus:ring-primary focus:bg-card focus:border-transparent outline-none transition-all resize-none h-20 text-left align-top"
                />
              </div>

              {/* Priority & Category Selector */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-semibold mb-1.5 ml-1">Priority</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as any)}
                    className="w-full bg-muted border border-transparent rounded-2xl p-3 text-xs focus:ring-2 focus:ring-primary focus:bg-card focus:border-transparent outline-none transition-all cursor-pointer font-medium"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold mb-1.5 ml-1">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full bg-muted border border-transparent rounded-2xl p-3 text-xs focus:ring-2 focus:ring-primary focus:bg-card focus:border-transparent outline-none transition-all cursor-pointer font-medium"
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-semibold mb-1.5 ml-1">Due Date</label>
                  <input
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="w-full bg-muted border border-transparent rounded-2xl p-3 text-xs focus:ring-2 focus:ring-primary focus:bg-card focus:border-transparent outline-none transition-all"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold mb-1.5 ml-1">Due Time</label>
                  <input
                    type="time"
                    value={newDueTime}
                    onChange={(e) => setNewDueTime(e.target.value)}
                    className="w-full bg-muted border border-transparent rounded-2xl p-3 text-xs focus:ring-2 focus:ring-primary focus:bg-card focus:border-transparent outline-none transition-all"
                  />
                </div>
              </div>

              {(newDueDate || newDueTime) && (
                <div className="bg-muted/60 border border-border/50 p-4 rounded-2xl space-y-3 animate-in slide-in-from-top duration-100">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold flex items-center gap-1.5">
                        <Bell size={14} className={reminderEnabled ? "text-primary" : "text-muted-foreground"} />
                        Enable Reminder
                      </span>
                      <span className="text-[10px] text-muted-foreground mt-0.5">Send a browser alert reminder</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={reminderEnabled}
                        onChange={(e) => setReminderEnabled(e.target.checked)}
                      />
                      <div className="w-10 h-5.5 bg-border/80 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4.5 after:w-4.5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>
                  
                  {reminderEnabled && (
                    <select
                      value={reminderOffset}
                      onChange={(e) => setReminderOffset(Number(e.target.value))}
                      className="w-full bg-card border border-border rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-primary outline-none transition-all cursor-pointer font-medium"
                    >
                      <option value={0}>At scheduled time</option>
                      <option value={5}>5 minutes before</option>
                      <option value={10}>10 minutes before</option>
                      <option value={30}>30 minutes before</option>
                      <option value={60}>1 hour before</option>
                      <option value={1440}>1 day before</option>
                    </select>
                  )}
                </div>
              )}

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    resetAddForm();
                  }}
                  className="flex-1 bg-muted border border-border/50 text-foreground font-semibold py-3 text-xs rounded-2xl hover:bg-muted/80 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-primary text-primary-foreground font-semibold py-3 text-xs rounded-2xl shadow-lg hover:shadow-primary/10 transition-all"
                >
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Task Modal */}
      {showEditModal && editingTask && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-md rounded-3xl shadow-2xl p-6 border border-border animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">Edit Task</h2>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingTask(null);
                }}
                className="text-muted-foreground hover:bg-muted p-2 rounded-full transition-colors"
              >
                <Plus size={18} className="rotate-45" />
              </button>
            </div>

            <form onSubmit={handleUpdateTask} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5 ml-1">Title</label>
                <input
                  type="text"
                  required
                  placeholder="What needs to be done?"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full bg-muted border border-transparent rounded-2xl p-3.5 text-sm focus:ring-2 focus:ring-primary focus:bg-card focus:border-transparent outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5 ml-1">Description (Optional)</label>
                <textarea
                  placeholder="Provide some details..."
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full bg-muted border border-transparent rounded-2xl p-3.5 text-sm focus:ring-2 focus:ring-primary focus:bg-card focus:border-transparent outline-none transition-all resize-none h-20 text-left align-top"
                />
              </div>

              {/* Priority & Category Selector */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-semibold mb-1.5 ml-1">Priority</label>
                  <select
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value as any)}
                    className="w-full bg-muted border border-transparent rounded-2xl p-3 text-xs focus:ring-2 focus:ring-primary focus:bg-card focus:border-transparent outline-none transition-all cursor-pointer font-medium"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold mb-1.5 ml-1">Category</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full bg-muted border border-transparent rounded-2xl p-3 text-xs focus:ring-2 focus:ring-primary focus:bg-card focus:border-transparent outline-none transition-all cursor-pointer font-medium"
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-semibold mb-1.5 ml-1">Due Date</label>
                  <input
                    type="date"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                    className="w-full bg-muted border border-transparent rounded-2xl p-3 text-xs focus:ring-2 focus:ring-primary focus:bg-card focus:border-transparent outline-none transition-all"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold mb-1.5 ml-1">Due Time</label>
                  <input
                    type="time"
                    value={editDueTime}
                    onChange={(e) => setEditDueTime(e.target.value)}
                    className="w-full bg-muted border border-transparent rounded-2xl p-3 text-xs focus:ring-2 focus:ring-primary focus:bg-card focus:border-transparent outline-none transition-all"
                  />
                </div>
              </div>

              {(editDueDate || editDueTime) && (
                <div className="bg-muted/60 border border-border/50 p-4 rounded-2xl space-y-3 animate-in slide-in-from-top duration-100">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold flex items-center gap-1.5">
                        <Bell size={14} className={editReminderEnabled ? "text-primary" : "text-muted-foreground"} />
                        Enable Reminder
                      </span>
                      <span className="text-[10px] text-muted-foreground mt-0.5">Send a browser alert reminder</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={editReminderEnabled}
                        onChange={(e) => setEditReminderEnabled(e.target.checked)}
                      />
                      <div className="w-10 h-5.5 bg-border/80 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4.5 after:w-4.5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>
                  
                  {editReminderEnabled && (
                    <select
                      value={editReminderOffset}
                      onChange={(e) => setEditReminderOffset(Number(e.target.value))}
                      className="w-full bg-card border border-border rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-primary outline-none transition-all cursor-pointer font-medium"
                    >
                      <option value={0}>At scheduled time</option>
                      <option value={5}>5 minutes before</option>
                      <option value={10}>10 minutes before</option>
                      <option value={30}>30 minutes before</option>
                      <option value={60}>1 hour before</option>
                      <option value={1440}>1 day before</option>
                    </select>
                  )}
                </div>
              )}

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingTask(null);
                  }}
                  className="flex-1 bg-muted border border-border/50 text-foreground font-semibold py-3 text-xs rounded-2xl hover:bg-muted/80 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-primary text-primary-foreground font-semibold py-3 text-xs rounded-2xl shadow-lg hover:shadow-primary/10 transition-all"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task Details & Progress Modal */}
      {showDetailModal && detailTask && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-2xl rounded-3xl shadow-2xl p-6 border border-border animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between mb-4 flex-shrink-0">
              <div>
                <div className="flex gap-2 mb-1.5 flex-wrap">
                  {detailTask.category && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getCategoryStyles(detailTask.category)}`}>
                      {detailTask.category}
                    </span>
                  )}
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getPriorityStyles(detailTask.priority)}`}>
                    {detailTask.priority ? detailTask.priority.toUpperCase() : 'MEDIUM'}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    detailTask.status === 'completed' 
                      ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
                      : detailTask.status === 'in_progress' 
                      ? 'bg-blue-500/10 text-blue-500 border-blue-500/20 animate-pulse' 
                      : 'bg-muted text-muted-foreground border-border/50'
                  }`}>
                    {detailTask.status === 'in_progress' ? 'IN PROGRESS' : detailTask.status.toUpperCase()}
                  </span>
                </div>
                <h2 className="text-xl font-bold text-foreground pr-8">{detailTask.title}</h2>
              </div>
              <button
                onClick={() => {
                  setShowDetailModal(false);
                  setDetailTask(null);
                  setTaskLogs([]);
                }}
                className="text-muted-foreground hover:bg-muted p-2 rounded-full transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto no-scrollbar space-y-6 pr-1">
              {/* Description */}
              {detailTask.description && (
                <div>
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Description</h4>
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{detailTask.description}</p>
                </div>
              )}

              {/* Time Tracking Controls */}
              <div className="bg-muted/40 border border-border/50 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${detailTask.status === 'in_progress' ? 'bg-blue-500/10 text-blue-500 animate-pulse' : 'bg-muted text-muted-foreground'}`}>
                    <Timer size={20} />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Tracked Time</div>
                    <div className="text-lg font-mono font-bold text-foreground">
                      {detailTask.status === 'in_progress' ? <ActiveTimer task={detailTask} /> : formatDuration(detailTask.time_spent || 0)}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 w-full sm:w-auto">
                  {detailTask.status === 'in_progress' ? (
                    <button
                      onClick={(e) => handleStatusChange(detailTask, 'pending', e)}
                      className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-muted hover:bg-muted/80 text-foreground text-xs font-bold px-4 py-2.5 rounded-xl border border-border transition-colors"
                    >
                      <Pause size={14} />
                      Pause Task
                    </button>
                  ) : detailTask.status === 'completed' ? (
                    <button
                      onClick={(e) => handleStatusChange(detailTask, 'pending', e)}
                      className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-muted hover:bg-muted/80 text-foreground text-xs font-bold px-4 py-2.5 rounded-xl border border-border transition-colors"
                    >
                      <History size={14} />
                      Reopen Task
                    </button>
                  ) : (
                    <button
                      onClick={(e) => handleStatusChange(detailTask, 'in_progress', e)}
                      className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-blue-500 text-white hover:bg-blue-600 text-xs font-bold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
                    >
                      <Play size={14} />
                      Start Task
                    </button>
                  )}

                  {detailTask.status !== 'completed' && (
                    <button
                      onClick={(e) => handleStatusChange(detailTask, 'completed', e)}
                      className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-emerald-500 text-white hover:bg-emerald-600 text-xs font-bold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
                    >
                      <CheckCircle2 size={14} />
                      Complete Task
                    </button>
                  )}
                </div>
              </div>

              {/* Progress Updates Timeline */}
              <div>
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Activity Feed</h4>
                {taskLogs.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No logs yet. Start the task or add an update below!</p>
                ) : (
                  <div className="relative border-l border-border pl-4 ml-3.5 space-y-5 py-1">
                    {taskLogs.map((log) => (
                      <div key={log.id} className="relative">
                        {/* Icon dot on the left */}
                        <span className="absolute -left-[27px] top-0 flex items-center justify-center w-6 h-6 rounded-full ring-4 ring-card bg-card border text-[10px] shadow-sm">
                          {getLogIcon(log.type)}
                        </span>
                        {/* Log content */}
                        <div className="flex flex-col">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-semibold text-foreground">{getLogTitle(log)}</span>
                            <span className="text-muted-foreground text-[10px]">
                              {new Date(log.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          {log.type === 'update' ? (
                            <div className="mt-2 p-3 bg-blue-500/[0.04] border-l-2 border-blue-500 rounded-r-xl text-xs font-medium text-foreground leading-relaxed shadow-sm">
                              {log.notes}
                            </div>
                          ) : (
                            !isDefaultSystemNote(log.notes) && log.notes && (
                              <p className="text-[11px] text-muted-foreground/80 mt-1 pl-1 leading-relaxed">
                                {log.notes}
                              </p>
                            )
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Add Progress Update form */}
            {detailTask.status !== 'completed' && (
              <form onSubmit={handleAddLogNote} className="border-t border-border/60 pt-4 mt-4 flex gap-2 flex-shrink-0">
                <input
                  type="text"
                  placeholder="Share a progress update or note..."
                  value={newLogNote}
                  onChange={(e) => setNewLogNote(e.target.value)}
                  className="flex-1 bg-muted border border-transparent rounded-2xl py-3 px-4 text-xs focus:ring-2 focus:ring-primary focus:bg-card focus:border-transparent outline-none transition-all"
                  required
                />
                <button
                  type="submit"
                  disabled={isAddingLog}
                  className="bg-primary text-primary-foreground font-semibold px-4 rounded-2xl text-xs hover:shadow-lg transition-all flex items-center gap-1.5"
                >
                  <MessageSquare size={14} />
                  <span>Update</span>
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Tasks;
