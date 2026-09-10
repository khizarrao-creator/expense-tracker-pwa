import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { executeQuery } from '../db/sqlite';
import {
  Target,
  Bell,
  TrendingUp,
  ChevronRight,
  Calculator as CalcIcon,
  DollarSign,
  CheckSquare,
  Handshake,
  Layers,
  Fuel,
  PieChart,
  Sparkles,
  CreditCard,
  MessageSquare,
  FolderKanban,
  Search,
  Settings,
  ShieldCheck,
  LayoutGrid,
  Landmark
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface MoreOption {
  id: string;
  name: string;
  description: string;
  path: string;
  icon: any;
  category: 'finance' | 'work' | 'ai' | 'tools' | 'system';
  color: string;
  bgColor: string;
  badge?: string | number;
}

const DEFAULT_OPTIONS: MoreOption[] = [
  {
    id: 'overview',
    name: 'Ledger Overview',
    description: 'Financial dashboard & net worth overview',
    path: '/ledger/overview',
    icon: Landmark,
    category: 'finance',
    color: 'text-primary',
    bgColor: 'bg-primary/10'
  },
  {
    id: 'transactions',
    name: 'Transaction Logs',
    description: 'Track all expenses, income, and transfers',
    path: '/ledger/transactions',
    icon: Landmark,
    category: 'finance',
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10'
  },
  {
    id: 'accounts',
    name: 'Accounts & Wallets',
    description: 'Manage bank accounts and cash balances',
    path: '/ledger/accounts',
    icon: LayoutGrid,
    category: 'finance',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10'
  },
  {
    id: 'categories',
    name: 'Expense Categories',
    description: 'Customize spending groups & budgets',
    path: '/ledger/categories',
    icon: LayoutGrid,
    category: 'finance',
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10'
  },
  {
    id: 'goals',
    name: 'Savings Goals',
    description: 'Set and track financial objectives',
    path: '/ledger/goals',
    icon: Target,
    category: 'finance',
    color: 'text-indigo-500',
    bgColor: 'bg-indigo-500/10'
  },
  {
    id: 'reminders',
    name: 'Bill Reminders',
    description: 'Never miss an upcoming payment',
    path: '/ledger/reminders',
    icon: Bell,
    category: 'finance',
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10'
  },
  {
    id: 'investments',
    name: 'Investments',
    description: 'Track portfolio growth & assets',
    path: '/ledger/investments',
    icon: TrendingUp,
    category: 'finance',
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10'
  },
  {
    id: 'loans',
    name: 'Loan Management',
    description: 'Track borrowing and lending debts',
    path: '/ledger/loans',
    icon: Handshake,
    category: 'finance',
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10'
  },
  {
    id: 'subscriptions',
    name: 'Subscription Manager',
    description: 'Track and analyze recurring plans',
    path: '/ledger/subscriptions',
    icon: CreditCard,
    category: 'finance',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10'
  },
  {
    id: 'events',
    name: 'Event Tracking',
    description: 'Group related trip & event costs',
    path: '/ledger/events',
    icon: Layers,
    category: 'finance',
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10'
  },
  {
    id: 'fuel',
    name: 'Vehicle & Fuel',
    description: 'Track fuel consumption & mileage',
    path: '/ledger/vehicles',
    icon: Fuel,
    category: 'finance',
    color: 'text-rose-500',
    bgColor: 'bg-rose-500/10'
  },
  {
    id: 'reports',
    name: 'Analytics & Reports',
    description: 'Comprehensive financial breakdowns',
    path: '/ledger/reports',
    icon: PieChart,
    category: 'finance',
    color: 'text-fuchsia-500',
    bgColor: 'bg-fuchsia-500/10'
  },
  {
    id: 'projects',
    name: 'Work Projects',
    description: 'Team projects, leads, HR & tasks',
    path: '/work/projects',
    icon: FolderKanban,
    category: 'work',
    color: 'text-indigo-500',
    bgColor: 'bg-indigo-500/10'
  },
  {
    id: 'tasks',
    name: 'Personal Tasks',
    description: 'Organize daily work to-dos',
    path: '/work/tasks',
    icon: CheckSquare,
    category: 'work',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10'
  },
  {
    id: 'ai-chat',
    name: 'AI Copilot',
    description: 'Chat with your personal financial AI',
    path: '/ai',
    icon: Sparkles,
    category: 'ai',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10'
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp Copilot',
    description: 'Read, send messages & sync WhatsApp',
    path: '/comms/whatsapp',
    icon: MessageSquare,
    category: 'ai',
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10'
  },
  {
    id: 'calculator',
    name: 'Financial Calculator',
    description: 'Quick math and percentages',
    path: '/ledger/calculator',
    icon: CalcIcon,
    category: 'tools',
    color: 'text-teal-500',
    bgColor: 'bg-teal-500/10'
  },
  {
    id: 'converter',
    name: 'Currency Converter',
    description: 'Real-time exchange rates',
    path: '/ledger/converter',
    icon: DollarSign,
    category: 'tools',
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-500/10'
  },
  {
    id: 'settings',
    name: 'App Settings',
    description: 'Currencies, themes, backup & profile',
    path: '/settings',
    icon: Settings,
    category: 'system',
    color: 'text-primary',
    bgColor: 'bg-primary/10'
  },
  {
    id: 'admin',
    name: 'Admin Console',
    description: 'System administration & configuration',
    path: '/admin',
    icon: ShieldCheck,
    category: 'system',
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10'
  }
];

const SortableItem = ({ option }: { option: MoreOption }) => {
  const navigate = useNavigate();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: option.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
  };

  const Icon = option.icon;

  const handleClick = (e: React.MouseEvent) => {
    if (isDragging) {
      e.preventDefault();
      return;
    }
    navigate(option.path);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      className={`relative group h-full ${isDragging ? 'opacity-50 scale-105 z-50' : 'opacity-100'} cursor-pointer select-none`}
    >
      <div
        className={`bg-card p-4 rounded-2xl border border-border flex flex-col justify-between h-full hover:shadow-md hover:border-primary/50 transition-all duration-200 ${
          isDragging ? 'shadow-xl border-primary bg-background' : ''
        }`}
      >
        <div>
          <div className="flex items-start justify-between mb-2.5">
            <div className={`p-2.5 rounded-xl ${option.bgColor} ${option.color} group-hover:scale-105 transition-transform shrink-0`}>
              <Icon size={18} />
            </div>
            {option.badge && (
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-lg border uppercase tracking-wider bg-primary/10 text-primary border-primary/20">
                {option.badge}
              </span>
            )}
          </div>

          <div className="space-y-1">
            <h3 className="font-bold text-xs text-foreground group-hover:text-primary transition-colors leading-snug">
              {option.name}
            </h3>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              {option.description}
            </p>
          </div>
        </div>

        <div className="mt-3 pt-2.5 border-t border-border/40 flex items-center justify-between text-[9px] font-extrabold text-muted-foreground group-hover:text-primary transition-colors uppercase tracking-wider">
          <span>Open</span>
          <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>
    </div>
  );
};

export const More: React.FC = () => {
  const { config, disabledFeatures } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const [taskCount, setTaskCount] = useState<number | null>(null);
  const [reminderCount, setReminderCount] = useState<number | null>(null);
  const [goalCount, setGoalCount] = useState<number | null>(null);

  const loadStats = async () => {
    try {
      const tasks = await executeQuery(`SELECT COUNT(*) as count FROM tasks WHERE status != 'completed'`);
      setTaskCount(tasks[0]?.count ?? 0);

      const reminders = await executeQuery(`SELECT COUNT(*) as count FROM reminders WHERE status = 'pending'`);
      setReminderCount(reminders[0]?.count ?? 0);

      const goals = await executeQuery(`SELECT COUNT(*) as count FROM goals`);
      setGoalCount(goals[0]?.count ?? 0);
    } catch (e) {
      console.error('Failed to load stats for More page', e);
    }
  };

  useEffect(() => {
    loadStats();
    window.addEventListener('app-sync-complete', loadStats);
    return () => window.removeEventListener('app-sync-complete', loadStats);
  }, []);

  const availableOptions = useMemo(() => {
    return DEFAULT_OPTIONS.filter(o => {
      if (o.id === 'fuel' && !config.fuelTrackingEnabled) return false;
      if (o.id === 'loans' && !config.loansEnabled) return false;
      if (config.disabledFeatures?.includes(o.id)) return false;
      if (disabledFeatures?.includes(o.id)) return false;
      return true;
    });
  }, [config.fuelTrackingEnabled, config.loansEnabled, config.disabledFeatures, disabledFeatures]);

  const filteredOptions = useMemo(() => {
    return availableOptions.filter(opt => {
      const matchesSearch =
        opt.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        opt.description.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCat = selectedCategory === 'all' || opt.category === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [availableOptions, searchQuery, selectedCategory]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 1500,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const optionsWithBadges = filteredOptions.map(opt => {
    if (opt.id === 'tasks' && taskCount !== null && taskCount > 0) {
      return { ...opt, badge: `${taskCount} pending` };
    }
    if (opt.id === 'reminders' && reminderCount !== null && reminderCount > 0) {
      return { ...opt, badge: `${reminderCount} unpaid` };
    }
    if (opt.id === 'goals' && goalCount !== null && goalCount > 0) {
      return { ...opt, badge: `${goalCount} active` };
    }
    return opt;
  });

  const categories = [
    { id: 'all', label: 'All Apps' },
    { id: 'finance', label: 'Finances 💰' },
    { id: 'work', label: 'Work & CRM 💼' },
    { id: 'ai', label: 'Intelligence 🤖' },
    { id: 'tools', label: 'Utilities 🛠️' },
    { id: 'system', label: 'System ⚙️' }
  ];

  return (
    <div className="space-y-5 max-w-6xl mx-auto pb-safe">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card border border-border/80 p-5 rounded-3xl shadow-xs">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
            <span className="p-2 rounded-xl bg-primary/10 text-primary">
              <Layers size={20} />
            </span>
            <span>All Apps & Features</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Browse all 20+ modular tools across finance, CRM, communications & intelligence.
          </p>
        </div>
      </div>

      {/* Search Input & Category Filter Chips */}
      <div className="space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search features (e.g. 'loans', 'fuel', 'tasks', 'converter')..."
            className="w-full bg-card border border-border/80 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-xs"
          />
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                selectedCategory === cat.id
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-card border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Feature Grid */}
      {optionsWithBadges.length === 0 ? (
        <div className="py-12 text-center text-xs text-muted-foreground bg-card border border-border rounded-3xl">
          No features found matching "{searchQuery}". Try a different search term.
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter}>
          <SortableContext items={optionsWithBadges.map(o => o.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {optionsWithBadges.map(option => (
                <SortableItem key={option.id} option={option} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
};

export default More;
