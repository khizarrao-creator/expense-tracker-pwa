import React from 'react';
import { useWork } from '../../contexts/WorkContext';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Briefcase,
  Users,
  Table,
  Sparkles,
  ArrowRight,
  Clock,
  UserCheck,
  MessageSquare,
  FileText
} from 'lucide-react';

export const ProjectDashboard: React.FC = () => {
  const { selectedProject } = useWork();
  const navigate = useNavigate();

  if (!selectedProject) return null;

  const quickNavCards = [
    {
      title: 'Project Tasks',
      desc: 'Track activities, milestones & team assignments',
      icon: CheckCircle2,
      path: `/work/projects/${selectedProject.id}/tasks`,
      color: 'text-blue-500 bg-blue-500/10 border-blue-500/20'
    },
    {
      title: 'Sales & Leads CRM',
      desc: 'Pipeline deal tracking and client stages',
      icon: Briefcase,
      path: `/work/projects/${selectedProject.id}/leads`,
      color: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20'
    },
    {
      title: 'Customer Directory',
      desc: 'Manage active customer profiles & direct communication',
      icon: UserCheck,
      path: `/work/projects/${selectedProject.id}/customers`,
      color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
    },
    {
      title: 'AI Knowledge Chat',
      desc: 'Project-specific AI bot configured with team rules',
      icon: Sparkles,
      path: `/work/projects/${selectedProject.id}/ai`,
      color: 'text-amber-500 bg-amber-500/10 border-amber-500/20'
    },
    {
      title: 'Spreadsheets',
      desc: 'Excel-like grids with automatic local & email backups',
      icon: Table,
      path: `/work/projects/${selectedProject.id}/sheets`,
      color: 'text-cyan-500 bg-cyan-500/10 border-cyan-500/20'
    },
    {
      title: 'WhatsApp Copilot',
      desc: 'Project-dedicated WhatsApp communication channel',
      icon: MessageSquare,
      path: `/work/projects/${selectedProject.id}/whatsapp`,
      color: 'text-rose-500 bg-rose-500/10 border-rose-500/20'
    }
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-3xl p-6 relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <h2 className="text-xl font-extrabold text-foreground">
            Welcome to {selectedProject.name} Engine
          </h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {selectedProject.description || 'Use the specialized sub-screens below to run tasks, manage sales leads, track active customers, run team spreadsheet grids, and leverage AI intelligence.'}
          </p>
        </div>
      </div>

      {/* Grid of Quick Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {quickNavCards.map(c => {
          const Icon = c.icon;
          return (
            <div
              key={c.title}
              onClick={() => navigate(c.path)}
              className="bg-card border border-border p-6 rounded-3xl shadow-sm hover:border-primary/50 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border mb-4 ${c.color}`}>
                  <Icon size={20} />
                </div>
                <h3 className="font-bold text-base text-foreground group-hover:text-primary transition-colors">
                  {c.title}
                </h3>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                  {c.desc}
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-border/40 flex items-center justify-end text-xs font-bold text-primary group-hover:translate-x-1 transition-transform">
                <span className="flex items-center gap-1">Open <ArrowRight size={14} /></span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Team Roster Summary */}
      <div className="bg-card border border-border rounded-3xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base flex items-center gap-2">
            <Users size={18} className="text-primary" /> Team Roster ({selectedProject.members?.length || 1})
          </h3>
          <button
            onClick={() => navigate(`/work/projects/${selectedProject.id}/members`)}
            className="text-xs font-bold text-primary hover:underline"
          >
            Manage Team & HR →
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {selectedProject.members?.map(m => (
            <div key={m.userId || m.email} className="bg-muted/40 border border-border/50 p-3.5 rounded-2xl flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center text-xs">
                {(m.displayName || m.email || 'U')[0].toUpperCase()}
              </div>
              <div className="truncate">
                <p className="text-xs font-bold text-foreground truncate">{m.displayName || m.email}</p>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">{m.role.replace('_', ' ')}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
