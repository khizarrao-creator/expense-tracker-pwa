import React, { useState, useMemo } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  List,
  PlusCircle,
  Settings,
  LogOut,
  CloudSync,
  Layers,
  LayoutGrid,
  Landmark,
  Briefcase,
  MessageSquare,
  Sparkles,
  FolderKanban,
  CheckSquare,
  Target,
  TrendingUp,
  Bell,
  CreditCard,
  Calendar,
  PieChart,
  Calculator as CalcIcon,
  DollarSign,
  Handshake,
  Fuel,
  Home,
  ChevronRight as ChevronRightIcon,
  Eye,
  EyeOff,
  Menu
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSync } from '../contexts/SyncContext';
import ConfirmModal from './ConfirmModal';
import { GlobalAIAssistant } from './GlobalAIAssistant';
import { useApp } from '../contexts/AppContext';
import { SyncProgressBar } from './SyncProgressBar';
import {
  getActiveModuleFromPath,
  getBreadcrumbs,
  CollapsibleSection,
  type NavSection
} from './ModuleSwitcher';
import { PullToRefresh } from './PullToRefresh';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { PWAInstallBanner } from './PWAInstallBanner';
import { AppLockModal } from './AppLockModal';
import { MobileDrawer } from './MobileDrawer';
import { haptic } from '../utils/haptics';

// ─── Sidebar Navigation Sections ────────────────────────────────────────────

const LEDGER_SECTION: NavSection = {
  module: 'ledger',
  label: 'Ledger',
  icon: Landmark,
  items: [
    { name: 'Overview', path: '/ledger/overview', icon: LayoutDashboard },
    { name: 'Transactions', path: '/ledger/transactions', icon: List },
    { name: 'Accounts', path: '/ledger/accounts', icon: Landmark },
    { name: 'Categories', path: '/ledger/categories', icon: LayoutGrid },
    { name: 'Savings Goals', path: '/ledger/goals', icon: Target, featureId: 'goals' },
    { name: 'Investments', path: '/ledger/investments', icon: TrendingUp, featureId: 'investments' },
    { name: 'Loans', path: '/ledger/loans', icon: Handshake, featureId: 'loans' },
    { name: 'Subscriptions', path: '/ledger/subscriptions', icon: CreditCard, featureId: 'subscriptions' },
    { name: 'Bill Reminders', path: '/ledger/reminders', icon: Bell, featureId: 'reminders' },
    { name: 'Event Tracking', path: '/ledger/events', icon: Calendar, featureId: 'events' },
    { name: 'Vehicles & Fuel', path: '/ledger/vehicles', icon: Fuel, featureId: 'fuel' },
    { name: 'Analytics & Reports', path: '/ledger/reports', icon: PieChart, featureId: 'reports' },
    { name: 'Calculator', path: '/ledger/calculator', icon: CalcIcon, featureId: 'calculator' },
    { name: 'Currency Converter', path: '/ledger/converter', icon: DollarSign, featureId: 'converter' },
  ]
};

const WORK_SECTION: NavSection = {
  module: 'work',
  label: 'Work',
  icon: Briefcase,
  items: [
    { name: 'Projects', path: '/work/projects', icon: FolderKanban, featureId: 'projects' },
    { name: 'Tasks', path: '/work/tasks', icon: CheckSquare, featureId: 'tasks' },
  ]
};

const COMMS_SECTION: NavSection = {
  module: 'comms',
  label: 'Communications',
  icon: MessageSquare,
  items: [
    { name: 'WhatsApp Copilot', path: '/comms/whatsapp', icon: MessageSquare, featureId: 'whatsapp' },
  ]
};

// ─── Layout Component ───────────────────────────────────────────────────────

import { useWork } from '../contexts/WorkContext';
import {
  Layout as LayoutIcon,
  CheckCircle2,
  Palette,
  Table as TableIcon,
  UserCheck
} from 'lucide-react';

const Layout: React.FC = () => {
  const { signOut } = useAuth();
  const { isSyncing, lastSynced, isOnline } = useSync();
  const { selectedProject } = useWork();
  const location = useLocation();
  const navigate = useNavigate();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const { isSidebarHidden, isPrivacyMode, togglePrivacyMode } = useApp();

  const { pullDistance, isRefreshing, isTriggered } = usePullToRefresh({
    onRefresh: async () => {
      haptic.success();
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    }
  });

  const activeModule = getActiveModuleFromPath(location.pathname);
  const breadcrumbs = getBreadcrumbs(location.pathname);

  // Dynamic Work/CRM navigation items
  const workSectionItems = useMemo(() => {
    const baseItems: NavSection['items'] = [
      { name: 'Projects', path: '/work/projects', icon: FolderKanban, featureId: 'projects' },
      { name: 'Personal Tasks', path: '/work/tasks', icon: CheckSquare, featureId: 'tasks' },
    ];

    if (selectedProject && location.pathname.includes('/work/projects/')) {
      const pId = selectedProject.id;
      baseItems.push(
        { name: `— ${selectedProject.name}`, path: `/work/projects/${pId}`, icon: LayoutIcon },
        { name: 'Tasks', path: `/work/projects/${pId}/tasks`, icon: CheckCircle2 },
        { name: 'Sales / Leads', path: `/work/projects/${pId}/leads`, icon: Briefcase },
        { name: 'Members (HR)', path: `/work/projects/${pId}/members`, icon: CheckSquare },
        { name: 'AI Chat', path: `/work/projects/${pId}/ai`, icon: Sparkles },
        { name: 'Customers', path: `/work/projects/${pId}/customers`, icon: UserCheck },
        { name: 'Sheets', path: `/work/projects/${pId}/sheets`, icon: TableIcon },
        { name: 'WhatsApp', path: `/work/projects/${pId}/whatsapp`, icon: MessageSquare },
        { name: 'Whiteboard', path: `/work/projects/${pId}/whiteboard`, icon: Palette },
        { name: 'Settings', path: `/work/projects/${pId}/settings`, icon: Settings }
      );
    }
    return baseItems;
  }, [selectedProject, location.pathname]);

  const workSection: NavSection = useMemo(() => ({
    module: 'work',
    label: 'CRM & Work',
    icon: Briefcase,
    items: workSectionItems
  }), [workSectionItems]);

  const allSections: NavSection[] = useMemo(() => [
    LEDGER_SECTION,
    workSection,
    COMMS_SECTION
  ], [workSection]);

  // Collapsible sidebar state — expand active module by default
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    [LEDGER_SECTION, WORK_SECTION, COMMS_SECTION].forEach(s => {
      initial[s.module] = s.module === activeModule;
    });
    return initial;
  });

  // Auto-expand active module when navigating
  useMemo(() => {
    if (activeModule === 'ledger' || activeModule === 'work' || activeModule === 'comms') {
      setExpandedSections(prev => {
        if (prev[activeModule]) return prev;
        return { ...prev, [activeModule]: true };
      });
    }
  }, [activeModule]);

  const toggleSection = (moduleId: string) => {
    setExpandedSections(prev => ({ ...prev, [moduleId]: !prev[moduleId] }));
  };

  // Mobile bottom nav items (4-Tab Fintech layout)
  const mobileNavItems = [
    { name: 'Home', path: '/', icon: Home },
    { name: 'Ledger', path: '/ledger/overview', icon: Landmark },
    { name: 'Add', path: '/add', icon: PlusCircle },
    { name: 'All Apps', path: '/more', icon: LayoutGrid },
  ];

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Failed to sign out', error);
    }
  };

  return (
    <div className="flex h-screen bg-muted/30">
      <PullToRefresh pullDistance={pullDistance} isRefreshing={isRefreshing} isTriggered={isTriggered} />
      <PWAInstallBanner />
      <AppLockModal />
      <MobileDrawer
        isOpen={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        onSignOut={() => setShowLogoutConfirm(true)}
      />

      {/* ── Desktop Sidebar ── */}
      <aside className={`${isSidebarHidden ? 'hidden' : 'hidden md:flex'} flex-col w-64 bg-card border-r border-border/80 transition-all duration-300`}>
        {/* Brand Header — clicking returns to The Base Dashboard */}
        <div className="p-5 border-b border-border/40">
          <Link to="/" className="flex items-center gap-3 group">
            <span className="bg-primary text-primary-foreground p-2 rounded-xl shadow-md group-hover:scale-105 transition-transform">
              <Layers size={20} />
            </span>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-foreground">The Base</h1>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                Workspace Suite
              </span>
            </div>
          </Link>
          {!isOnline && (
            <div className="mt-3 text-[10px] bg-destructive/10 text-destructive px-2 py-1 rounded-md font-bold flex items-center gap-1.5 border border-destructive/20">
              <div className="w-1.5 h-1.5 bg-destructive rounded-full animate-pulse" />
              OFFLINE MODE
            </div>
          )}
        </div>

        {/* Home Link */}
        <div className="px-3 pt-3 pb-1">
          <Link
            to="/"
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all duration-150 text-xs font-semibold ${
              location.pathname === '/'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
            }`}
          >
            <Home size={16} className={location.pathname === '/' ? 'text-primary-foreground' : 'opacity-70'} />
            <span>Home</span>
          </Link>
        </div>

        {/* Collapsible Module Sections */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          {allSections.map(section => (
            <CollapsibleSection
              key={section.module}
              section={section}
              isExpanded={expandedSections[section.module] ?? false}
              onToggle={() => toggleSection(section.module)}
              currentPath={location.pathname}
            />
          ))}

          {/* Divider */}
          <div className="my-2 border-t border-border/40" />

          {/* AI Copilot — visually distinct */}
          <button
            onClick={() => navigate('/ai')}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all duration-150 text-xs font-bold ${
              activeModule === 'ai'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-primary bg-primary/5 border border-primary/20 hover:bg-primary/10'
            }`}
          >
            <Sparkles size={16} className={activeModule === 'ai' ? 'text-primary-foreground' : ''} />
            <span>AI Copilot</span>
            <span className={`ml-auto text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
              activeModule === 'ai' ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-primary/10 text-primary'
            }`}>
              AI
            </span>
          </button>

          {/* Settings */}
          <Link
            to="/settings"
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all duration-150 text-xs font-semibold ${
              location.pathname === '/settings'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
            }`}
          >
            <Settings size={16} className={location.pathname === '/settings' ? 'text-primary-foreground' : 'opacity-70'} />
            <span>Settings</span>
          </Link>
        </nav>

        {/* Footer Sync & Sign Out */}
        <div className="p-4 border-t border-border/40 space-y-3">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground px-1 font-mono">
            <CloudSync size={14} className={isSyncing ? 'animate-spin text-primary' : 'opacity-70'} />
            <span>{isSyncing ? 'Syncing...' : `Synced: ${lastSynced ? lastSynced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Ready'}`}</span>
          </div>
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="flex items-center gap-2.5 px-3 py-2 w-full rounded-lg text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors font-medium"
          >
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ── Main Content Area ── */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <SyncProgressBar />

        {/* Desktop Top Header — Breadcrumbs (no more segmented pills) */}
        <header className="hidden md:flex bg-card/80 backdrop-blur-md border-b border-border/60 px-6 py-3 items-center justify-between z-10 sticky top-0 shadow-xs">
          <nav className="flex items-center gap-1.5 text-xs">
            <Link to="/" className="font-bold text-foreground hover:text-primary transition-colors">
              The Base
            </Link>
            {breadcrumbs.module !== 'Home' && (
              <>
                <ChevronRightIcon size={12} className="text-muted-foreground" />
                <span className="font-semibold text-muted-foreground">{breadcrumbs.module}</span>
              </>
            )}
            {breadcrumbs.page && breadcrumbs.page !== breadcrumbs.module && (
              <>
                <ChevronRightIcon size={12} className="text-muted-foreground" />
                <span className="font-semibold text-primary">{breadcrumbs.page}</span>
              </>
            )}
          </nav>

          <div className="flex items-center gap-3">
            <button
              onClick={togglePrivacyMode}
              title={isPrivacyMode ? "Show Financial Values" : "Blur Financial Values"}
              className={`p-1.5 px-2.5 rounded-lg border transition-all flex items-center gap-1.5 text-xs font-semibold ${
                isPrivacyMode
                  ? 'bg-amber-500/10 text-amber-500 border-amber-500/30 font-bold'
                  : 'bg-muted/40 text-muted-foreground hover:text-foreground border-border/40'
              }`}
            >
              {isPrivacyMode ? <EyeOff size={14} /> : <Eye size={14} />}
              <span className="text-[11px] font-mono">{isPrivacyMode ? 'Privacy ON' : 'Privacy'}</span>
            </button>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-muted/40 px-2.5 py-1 rounded-lg border border-border/40">
              <CloudSync size={14} className={isSyncing ? 'animate-spin text-primary' : 'text-emerald-500'} />
              <span className="text-[11px] font-mono">{isSyncing ? 'Syncing' : 'Live'}</span>
            </div>
          </div>
        </header>

        {/* Mobile Header */}
        <header className={`${isSidebarHidden ? 'hidden' : 'md:hidden'} bg-card/90 backdrop-blur-md border-b border-border/80 px-3 py-2.5 flex items-center justify-between z-10 sticky top-0 shadow-xs pt-safe`}>
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => {
                haptic.tap();
                setMobileDrawerOpen(true);
              }}
              className="p-1.5 text-foreground hover:bg-muted rounded-xl transition-colors shrink-0"
              title="Open Navigation Menu"
            >
              <Menu size={20} />
            </button>
            <Link to="/" className="flex items-center gap-2 shrink-0">
              <span className="bg-primary text-primary-foreground p-1 rounded-lg">
                <Layers size={16} />
              </span>
            </Link>
            <div className="min-w-0">
              <h1 className="text-sm font-extrabold tracking-tight text-foreground truncate">
                {breadcrumbs.page && breadcrumbs.page !== 'Home' ? breadcrumbs.page : 'The Base'}
              </h1>
              {breadcrumbs.module !== 'Home' && breadcrumbs.page !== breadcrumbs.module && (
                <span className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">{breadcrumbs.module}</span>
              )}
            </div>
            {!isOnline && (
              <span className="text-[9px] text-destructive font-bold uppercase tracking-wider bg-destructive/10 px-1.5 py-0.5 rounded-full shrink-0">Offline</span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => {
                haptic.tap();
                navigate('/ai');
              }}
              title="AI Copilot"
              className="p-1.5 rounded-xl text-primary bg-primary/10 hover:bg-primary/20 transition-all flex items-center gap-1 text-[11px] font-bold px-2"
            >
              <Sparkles size={14} />
              <span>AI</span>
            </button>

            <button
              onClick={() => {
                haptic.selection();
                togglePrivacyMode();
              }}
              title={isPrivacyMode ? "Show Financial Values" : "Blur Financial Values"}
              className={`p-1.5 rounded-xl border transition-all ${
                isPrivacyMode
                  ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                  : 'bg-muted/40 text-muted-foreground border-border/40'
              }`}
            >
              {isPrivacyMode ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>

            <div className="p-1">
              <CloudSync size={15} className={isSyncing ? 'animate-spin text-primary' : 'text-emerald-500'} />
            </div>
          </div>
        </header>

        <div className={`flex-1 overflow-y-auto ${isSidebarHidden ? 'p-2 md:p-3 pb-safe' : 'p-3 md:p-8 pb-24 md:pb-8'}`}>
          <Outlet />
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className={`${isSidebarHidden ? 'hidden' : 'md:hidden'} fixed bottom-0 w-full bg-card/95 backdrop-blur-xl border-t border-border/60 flex items-center justify-around px-2 py-1 pb-safe z-20 shadow-lg`}>
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.path === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(item.path);
          const isAdd = item.name === 'Add';

          if (isAdd) {
            return (
              <Link
                key={item.name}
                to={item.path}
                onClick={() => haptic.tap()}
                className="flex flex-col items-center justify-center flex-1 py-1"
              >
                <div className="bottom-nav-fab">
                  <Icon size={20} />
                </div>
                <span className="text-[9px] font-bold text-primary mt-0.5">Add</span>
              </Link>
            );
          }

          return (
            <Link
              key={item.name}
              to={item.path}
              onClick={() => haptic.tap()}
              className={`bottom-nav-item ${
                isActive ? 'bottom-nav-item-active text-primary font-bold' : 'text-muted-foreground'
              }`}
            >
              <Icon size={19} className={isActive ? '' : 'opacity-70'} />
              <span className="text-[9px] font-semibold mt-0.5">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <ConfirmModal
        isOpen={showLogoutConfirm}
        title="Sign Out?"
        message="Are you sure you want to sign out? You will need to sign in again to access your synced data."
        onConfirm={handleSignOut}
        onCancel={() => setShowLogoutConfirm(false)}
        variant="danger"
        confirmText="Sign Out"
      />

      <GlobalAIAssistant />
    </div>
  );
};

export default Layout;
