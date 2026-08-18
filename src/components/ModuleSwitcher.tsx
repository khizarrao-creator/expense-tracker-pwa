import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Landmark,
  Briefcase,
  MessageSquare,
  ChevronDown
} from 'lucide-react';

// ─── Module Definitions ─────────────────────────────────────────────────────

export type AppModule = 'ledger' | 'work' | 'comms';

export interface ModuleInfo {
  id: AppModule;
  name: string;
  shortName: string;
  defaultPath: string;
  icon: React.ElementType;
  description: string;
}

export const MODULES: ModuleInfo[] = [
  {
    id: 'ledger',
    name: 'Ledger',
    shortName: 'Ledger',
    defaultPath: '/ledger/overview',
    icon: Landmark,
    description: 'Complete financial management suite'
  },
  {
    id: 'work',
    name: 'Work Management',
    shortName: 'Work',
    defaultPath: '/work/projects',
    icon: Briefcase,
    description: 'Projects, tasks & team collaboration'
  },
  {
    id: 'comms',
    name: 'Communications',
    shortName: 'Comms',
    defaultPath: '/comms/whatsapp',
    icon: MessageSquare,
    description: 'WhatsApp & messaging channels'
  }
];

// ─── Path Resolution ────────────────────────────────────────────────────────

export const getActiveModuleFromPath = (pathname: string): AppModule | 'home' | 'ai' | 'settings' => {
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/ai')) return 'ai';
  if (pathname.startsWith('/settings')) return 'settings';
  if (pathname.startsWith('/work') || pathname.startsWith('/projects')) return 'work';
  if (pathname.startsWith('/comms') || pathname.startsWith('/whatsapp')) return 'comms';
  // Everything else falls under Ledger (financial suite)
  return 'ledger';
};

// ─── Breadcrumb Labels ──────────────────────────────────────────────────────

const BREADCRUMB_MAP: Record<string, string> = {
  '/': 'Home',
  '/ledger/overview': 'Overview',
  '/ledger/transactions': 'Transactions',
  '/ledger/accounts': 'Accounts',
  '/ledger/categories': 'Categories',
  '/ledger/budgets': 'Budgets',
  '/ledger/goals': 'Savings Goals',
  '/ledger/investments': 'Investments',
  '/ledger/loans': 'Loans',
  '/ledger/subscriptions': 'Subscriptions',
  '/ledger/reminders': 'Bill Reminders',
  '/ledger/events': 'Event Tracking',
  '/ledger/reports': 'Analytics & Reports',
  '/ledger/calculator': 'Calculator',
  '/ledger/converter': 'Currency Converter',
  '/ledger/vehicles': 'Vehicles & Fuel',
  '/work/projects': 'Projects',
  '/work/tasks': 'Tasks',
  '/comms/whatsapp': 'WhatsApp Copilot',
  '/ai': 'AI Copilot',
  '/settings': 'Settings',
  '/add': 'Add Transaction',
  '/more': 'All Apps',
};

export const getBreadcrumbs = (pathname: string): { module: string; page: string } => {
  const activeModule = getActiveModuleFromPath(pathname);
  const moduleMeta = MODULES.find(m => m.id === activeModule);

  let moduleName = 'The Base';
  if (activeModule === 'ai') moduleName = 'AI Copilot';
  else if (activeModule === 'settings') moduleName = 'Settings';
  else if (activeModule === 'home') moduleName = 'Home';
  else if (moduleMeta) moduleName = moduleMeta.name;

  let page = BREADCRUMB_MAP[pathname];
  if (!page) {
    const parts = pathname.split('/').filter(Boolean);
    const lastPart = parts[parts.length - 1];
    if (lastPart === 'tasks') page = 'Project Tasks';
    else if (lastPart === 'leads') page = 'Sales / Leads CRM';
    else if (lastPart === 'customers') page = 'Customers';
    else if (lastPart === 'members') page = 'Team & HR';
    else if (lastPart === 'sheets') page = 'Spreadsheets';
    else if (lastPart === 'ai') page = 'AI Knowledge Chat';
    else if (lastPart === 'whatsapp') page = 'WhatsApp';
    else if (lastPart === 'whiteboard') page = 'Whiteboard';
    else if (lastPart === 'settings') page = 'Project Settings';
    else page = lastPart || '';
  }

  return { module: moduleName, page };
};

// ─── Sidebar Navigation Sections ────────────────────────────────────────────

export interface NavItem {
  name: string;
  path: string;
  icon: React.ElementType;
  featureId?: string;
}

export interface NavSection {
  module: AppModule;
  label: string;
  icon: React.ElementType;
  items: NavItem[];
}

// ─── Collapsible Sidebar Section ────────────────────────────────────────────

interface CollapsibleSectionProps {
  section: NavSection;
  isExpanded: boolean;
  onToggle: () => void;
  currentPath: string;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  section,
  isExpanded,
  onToggle,
  currentPath
}) => {
  const navigate = useNavigate();
  const Icon = section.icon;
  const hasActiveChild = section.items.some(item =>
    currentPath === item.path || currentPath.startsWith(item.path + '/')
  );

  return (
    <div className="space-y-0.5">
      {/* Section Header */}
      <button
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-150 ${
          hasActiveChild || isExpanded
            ? 'text-foreground bg-muted/50'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <Icon size={15} className={hasActiveChild ? 'text-primary' : 'opacity-60'} />
          <span>{section.label}</span>
        </div>
        <ChevronDown
          size={13}
          className={`transition-transform duration-200 opacity-50 ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
        />
      </button>

      {/* Collapsible Items */}
      {isExpanded && (
        <div className="ml-2 pl-3 border-l border-border/40 space-y-0.5">
          {section.items.map(item => {
            const ItemIcon = item.icon;
            const isActive = currentPath === item.path ||
              (item.path !== '/' && currentPath.startsWith(item.path + '/'));

            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-150 text-xs font-medium ${
                  isActive
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                }`}
              >
                <ItemIcon size={14} className={isActive ? 'text-primary-foreground' : 'opacity-60'} />
                <span>{item.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
