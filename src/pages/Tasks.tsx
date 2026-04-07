import React, { useEffect, useState } from 'react';
import { getTasks, addTask, updateTask, deleteTask } from '../db/queries';
import type { Task } from '../db/queries';
import { Plus, CheckSquare, Trash2, Calendar, Circle, CheckCircle2, Clock, Bell } from 'lucide-react';
import { toast } from 'sonner';

const Tasks: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form State
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newDueTime, setNewDueTime] = useState('');
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderOffset, setReminderOffset] = useState(5);

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
    if (!newTitle) return;

    try {
      await addTask(
        newTitle,
        newDescription,
        'pending',
        newDueDate || null,
        newDueTime || null,
        reminderEnabled ? 1 : 0,
        reminderOffset,
        crypto.randomUUID()
      );
      toast.success('Task added successfully');
      setShowAddModal(false);
      setNewTitle('');
      setNewDescription('');
      setNewDueDate('');
      setNewDueTime('');
      setReminderEnabled(false);
      setReminderOffset(5);
      loadData();
    } catch (error) {
      toast.error('Failed to add task');
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

  const toggleTaskStatus = async (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const newStatus = task.status === 'completed' ? 'pending' : 'completed';
      await updateTask(task.id, { status: newStatus });
      loadData();
    } catch (error) {
      toast.error('Failed to update task');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const pendingTasks = tasks.filter(t => t.status !== 'completed');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Task Manager</h1>
          <p className="text-muted-foreground mt-1">Organize your daily activities and to-dos.</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-primary text-primary-foreground p-3 rounded-xl shadow-lg hover:shadow-primary/20 transition-all flex items-center gap-2"
        >
          <Plus size={20} />
          <span className="hidden sm:inline font-medium">New Task</span>
        </button>
      </div>

      <div className="space-y-8">
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            Pending Tasks
            <span className="bg-primary/10 text-primary text-xs py-0.5 px-2 rounded-full">{pendingTasks.length}</span>
          </h2>
          {pendingTasks.length === 0 ? (
            <div className="py-8 text-center border-2 border-dashed border-border rounded-2xl bg-card">
              <div className="bg-muted inline-p-4 rounded-full mb-4 inline-block p-4">
                <CheckSquare size={32} className="text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm font-medium">No pending tasks. You're all caught up!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pendingTasks.map(task => (
                <TaskCard 
                  key={task.id} 
                  task={task} 
                  onToggle={(e) => toggleTaskStatus(task, e)} 
                  onDelete={(e) => handleDeleteTask(task.id, e)} 
                />
              ))}
            </div>
          )}
        </div>

        {completedTasks.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-muted-foreground">
              Completed Tasks
              <span className="bg-muted text-muted-foreground text-xs py-0.5 px-2 rounded-full">{completedTasks.length}</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-75">
              {completedTasks.map(task => (
                <TaskCard 
                  key={task.id} 
                  task={task} 
                  onToggle={(e) => toggleTaskStatus(task, e)} 
                  onDelete={(e) => handleDeleteTask(task.id, e)} 
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-md rounded-3xl shadow-2xl p-6 border border-border animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Add Task</h2>
              <button onClick={() => setShowAddModal(false)} className="text-muted-foreground hover:bg-muted p-2 rounded-full">
                <Plus size={20} className="rotate-45" />
              </button>
            </div>

            <form onSubmit={handleAddTask} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5 ml-1">Title</label>
                <input
                  type="text"
                  required
                  placeholder="What needs to be done?"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-muted border-none rounded-2xl p-4 focus:ring-2 focus:ring-primary transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 ml-1">Description (Optional)</label>
                <textarea
                  placeholder="Details..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full bg-muted border-none rounded-2xl p-4 focus:ring-2 focus:ring-primary transition-all resize-none h-24"
                />
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1.5 ml-1">Due Date</label>
                  <input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} className="w-full bg-muted border-none rounded-2xl p-4 focus:ring-2 focus:ring-primary transition-all" />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1.5 ml-1">Due Time</label>
                  <input type="time" value={newDueTime} onChange={(e) => setNewDueTime(e.target.value)} className="w-full bg-muted border-none rounded-2xl p-4 focus:ring-2 focus:ring-primary transition-all" />
                </div>
              </div>

              {(newDueDate || newDueTime) && (
                <div className="bg-muted p-4 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium flex items-center gap-2">
                        <Bell size={16} className={reminderEnabled ? "text-primary" : "text-muted-foreground"} />
                        Enable Reminder
                      </span>
                      <span className="text-xs text-muted-foreground mt-0.5">Push notification will be sent</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={reminderEnabled} onChange={(e) => setReminderEnabled(e.target.checked)} />
                      <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>
                  
                  {reminderEnabled && (
                    <select
                      value={reminderOffset}
                      onChange={(e) => setReminderOffset(Number(e.target.value))}
                      className="w-full bg-background border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary transition-all cursor-pointer"
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

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 bg-muted font-semibold py-4 rounded-2xl hover:bg-muted/80 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-primary text-primary-foreground font-semibold py-4 rounded-2xl shadow-lg hover:shadow-primary/20 transition-all"
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

// Helper component for task card
const TaskCard = ({ task, onToggle, onDelete }: { task: Task, onToggle: (e: React.MouseEvent) => void, onDelete: (e: React.MouseEvent) => void }) => {
  const isCompleted = task.status === 'completed';
  
  return (
    <div 
      className={`bg-card p-5 rounded-2xl shadow-sm border border-border group relative transition-all cursor-pointer ${isCompleted ? 'hover:border-emerald-500/50' : 'hover:border-primary/50'}`}
      onClick={(e) => onToggle(e)}
    >
      <button
        onClick={onDelete}
        className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity z-10"
      >
        <Trash2 size={16} />
      </button>

      <div className="flex gap-3 mb-2 pr-8">
        <div className="mt-1 flex-shrink-0">
          {isCompleted ? (
             <CheckCircle2 size={20} className="text-emerald-500 transition-colors" />
          ) : (
             <Circle size={20} className="text-muted-foreground hover:text-primary transition-colors" />
          )}
        </div>
        <div>
          <h3 className={`font-semibold ${isCompleted ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
            {task.title}
          </h3>
          {task.description && (
            <p className={`text-sm mt-1 line-clamp-2 ${isCompleted ? 'text-muted-foreground/60' : 'text-muted-foreground'}`}>
              {task.description}
            </p>
          )}
        </div>
      </div>
      
      {(task.due_date || task.due_time) && (
        <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            {task.due_date && (
              <span className={`flex items-center ${!isCompleted && new Date(task.due_date) < new Date() ? 'text-rose-500 font-medium' : ''}`}>
                <Calendar size={12} className="mr-1.5" />
                {new Date(task.due_date).toLocaleDateString()}
              </span>
            )}
            {task.due_time && (
              <span className={`flex items-center ${!isCompleted ? 'text-foreground/80' : ''}`}>
                <Clock size={12} className="mr-1.5" />
                {task.due_time}
              </span>
            )}
          </div>
          {task.reminder_enabled === 1 && (
            <div title="Reminder Active" className="flex items-center">
              <Bell size={14} className={task.reminder_sent === 1 ? "text-muted-foreground/30" : "text-primary"} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Tasks;
