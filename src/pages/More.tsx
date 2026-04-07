import React from 'react';
import { Link } from 'react-router-dom';
import { Target, Bell, TrendingUp, ChevronRight, Calculator as CalcIcon, DollarSign, CheckSquare } from 'lucide-react';

const More: React.FC = () => {
  const moreOptions = [
    {
      name: 'Savings Goals',
      description: 'Set and track financial objectives',
      path: '/goals',
      icon: Target,
      color: 'text-indigo-500',
      bgColor: 'bg-indigo-500/10'
    },
    {
      name: 'Bill Reminders',
      description: 'Never miss an upcoming payment',
      path: '/reminders',
      icon: Bell,
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10'
    },
    {
      name: 'Investments',
      description: 'Track your portfolio growth',
      path: '/investments',
      icon: TrendingUp,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10'
    },
    {
      name: 'Calculator',
      description: 'Quick math and percentages',
      path: '/calculator',
      icon: CalcIcon,
      color: 'text-rose-500',
      bgColor: 'bg-rose-500/10'
    },
    {
      name: 'Currency Converter',
      description: 'Real-time exchange rates',
      path: '/converter',
      icon: DollarSign,
      color: 'text-cyan-500',
      bgColor: 'bg-cyan-500/10'
    },
    {
      name: 'Task Manager',
      description: 'Organize your daily activities and to-dos',
      path: '/tasks',
      icon: CheckSquare,
      color: 'text-violet-500',
      bgColor: 'bg-violet-500/10'
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">More Features</h1>
        <p className="text-muted-foreground mt-1">Access additional tools to manage your wealth.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {moreOptions.map((option) => {
          const Icon = option.icon;
          return (
            <Link
              key={option.name}
              to={option.path}
              className="bg-card p-6 rounded-2xl border border-border flex items-center justify-between hover:shadow-md hover:border-primary/50 transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl ${option.bgColor} ${option.color} group-hover:scale-110 transition-transform`}>
                  <Icon size={24} />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{option.name}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">{option.description}</p>
                </div>
              </div>
              <ChevronRight size={20} className="text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default More;
