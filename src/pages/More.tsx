import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Target,
  Bell,
  TrendingUp,
  ChevronRight,
  Calculator as CalcIcon,
  DollarSign,
  CheckSquare,
  Handshake,
  Info,
  Layers,
  Fuel
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
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
  color: string;
  bgColor: string;
}

const DEFAULT_OPTIONS: MoreOption[] = [
  {
    id: 'goals',
    name: 'Savings Goals',
    description: 'Set and track financial objectives',
    path: '/goals',
    icon: Target,
    color: 'text-indigo-500',
    bgColor: 'bg-indigo-500/10'
  },
  {
    id: 'reminders',
    name: 'Bill Reminders',
    description: 'Never miss an upcoming payment',
    path: '/reminders',
    icon: Bell,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10'
  },
  {
    id: 'investments',
    name: 'Investments',
    description: 'Track your portfolio growth',
    path: '/investments',
    icon: TrendingUp,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10'
  },
  {
    id: 'calculator',
    name: 'Calculator',
    description: 'Quick math and percentages',
    path: '/calculator',
    icon: CalcIcon,
    color: 'text-rose-500',
    bgColor: 'bg-rose-500/10'
  },
  {
    id: 'converter',
    name: 'Currency Converter',
    description: 'Real-time exchange rates',
    path: '/converter',
    icon: DollarSign,
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-500/10'
  },
  {
    id: 'tasks',
    name: 'Task Manager',
    description: 'Organize your daily activities and to-dos',
    path: '/tasks',
    icon: CheckSquare,
    color: 'text-violet-500',
    bgColor: 'bg-violet-500/10'
  },
  {
    id: 'loans',
    name: 'Loan Management',
    description: 'Track borrowing and lending',
    path: '/loans',
    icon: Handshake,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10'
  },
  {
    id: 'events',
    name: 'Event Tracking',
    description: 'Group related expenses and loans',
    path: '/events',
    icon: Layers,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10'
  },
  {
    id: 'fuel',
    name: 'Fuel Tracking',
    description: 'Track fuel consumption and costs',
    path: '/fuel',
    icon: Fuel,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10'
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
    // If a drag was initiated, prevent navigation
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
      className={`relative group ${isDragging ? 'opacity-50 scale-105 z-50' : 'opacity-100'} cursor-pointer select-none`}
    >
      <div
        className={`bg-card p-6 rounded-2xl border border-border flex items-center justify-between hover:shadow-md hover:border-primary/50 transition-all ${isDragging ? 'shadow-xl border-primary' : ''}`}
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
      </div>
    </div>
  );
};

const More: React.FC = () => {
  const { config } = useApp();
  
  const [options, setOptions] = useState<MoreOption[]>(() => {
    // Filter available options based on global config
    const availableDefaults = DEFAULT_OPTIONS.filter(o => {
      if (o.id === 'fuel' && !config.fuelTrackingEnabled) return false;
      if (o.id === 'loans' && !config.loansEnabled) return false;
      return true;
    });

    const saved = localStorage.getItem('more_options_order');
    if (saved) {
      try {
        const order = JSON.parse(saved);
        const sorted = order
          .map((id: string) => availableDefaults.find(o => o.id === id))
          .filter(Boolean) as MoreOption[];

        // Add any missing options (e.g. if new features were added)
        const missing = availableDefaults.filter(d => !sorted.find(s => s.id === d.id));
        return [...sorted, ...missing];
      } catch (e) {
        return availableDefaults;
      }
    }
    return availableDefaults;
  });

  // Re-filter if global config changes
  useEffect(() => {
    setOptions(prev => {
      const filtered = prev.filter(o => {
        if (o.id === 'fuel' && !config.fuelTrackingEnabled) return false;
        if (o.id === 'loans' && !config.loansEnabled) return false;
        return true;
      });
      
      // If some options were disabled, we might need to add back options that were re-enabled
      const availableDefaults = DEFAULT_OPTIONS.filter(o => {
        if (o.id === 'fuel' && !config.fuelTrackingEnabled) return false;
        if (o.id === 'loans' && !config.loansEnabled) return false;
        return true;
      });
      
      const missing = availableDefaults.filter(d => !filtered.find(s => s.id === d.id));
      return [...filtered, ...missing];
    });
  }, [config.fuelTrackingEnabled, config.loansEnabled]);

  useEffect(() => {
    localStorage.setItem('more_options_order', JSON.stringify(options.map(o => o.id)));
  }, [options]);

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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setOptions((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">More Features</h1>
            <div className="relative">
              <button
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                onClick={() => setShowTooltip(!showTooltip)}
                className="p-1 text-muted-foreground hover:text-primary transition-colors focus:outline-none"
                aria-label="How to reorder"
              >
                <Info size={18} />
              </button>
              {showTooltip && (
                <div className="absolute left-0 top-full mt-3 w-64 p-3 bg-card text-foreground text-xs rounded-xl border border-border shadow-xl z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  <p className="font-medium leading-relaxed">
                    Rearrange tools by long-pressing on any card for 1.5 seconds.
                  </p>
                  <div className="absolute top-0 left-3 transform -translate-y-1/2 rotate-45 w-2 h-2 bg-card border-l border-t border-border" />
                </div>
              )}
            </div>
          </div>
          <p className="text-muted-foreground mt-1">Access additional tools to manage your wealth.</p>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={options.map(o => o.id)}
          strategy={rectSortingStrategy}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {options.map((option) => (
              <SortableItem key={option.id} option={option} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
};

export default More;
