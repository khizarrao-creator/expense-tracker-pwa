import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  X,
  Layers,
  Home,
  Landmark,
  List,
  LayoutGrid,
  Target,
  TrendingUp,
  Handshake,
  CreditCard,
  Bell,
  Calendar,
  Fuel,
  PieChart,
  Calculator as CalcIcon,
  DollarSign,
  FolderKanban,
  CheckSquare,
  MessageSquare,
  Sparkles,
  Bot,
  Settings,
  ShieldCheck,
  LogOut,
  Moon,
  Sun,
  Eye,
  EyeOff
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useApp } from '../contexts/AppContext';
import { useTheme } from '../contexts/ThemeContext';
import { haptic } from '../utils/haptics';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSignOut: () => void;
}

export const MobileDrawer: React.FC<MobileDrawerProps> = ({
  isOpen,
  onClose,
  onSignOut
}) => {
  const location = useLocation();
  const { user } = useAuth();
  const { isPrivacyMode, togglePrivacyMode } = useApp();
  const { theme, setTheme } = useTheme();

  if (!isOpen) return null;

  const handleNavClick = () => {
    haptic.tap();
    onClose();
  };

  const isDarkMode = theme === 'dark';
  const toggleTheme = () => {
    haptic.selection();
    setTheme(isDarkMode ? 'light' : 'dark');
  };

  const navSections = [
    {
      title: 'Ledger Suite',
      items: [
        { name: 'Overview', path: '/ledger/overview', icon: Landmark },
        { name: 'Transactions', path: '/ledger/transactions', icon: List },
        { name: 'Accounts', path: '/ledger/accounts', icon: LayoutGrid },
        { name: 'Categories', path: '/ledger/categories', icon: LayoutGrid },
        { name: 'Savings Goals', path: '/ledger/goals', icon: Target },
        { name: 'Investments', path: '/ledger/investments', icon: TrendingUp },
        { name: 'Loans & Debt', path: '/ledger/loans', icon: Handshake },
        { name: 'Subscriptions', path: '/ledger/subscriptions', icon: CreditCard },
        { name: 'Bill Reminders', path: '/ledger/reminders', icon: Bell },
        { name: 'Event Tracking', path: '/ledger/events', icon: Calendar },
        { name: 'Vehicles & Fuel', path: '/ledger/vehicles', icon: Fuel },
        { name: 'Analytics & Reports', path: '/ledger/reports', icon: PieChart },
        { name: 'Calculator', path: '/ledger/calculator', icon: CalcIcon },
        { name: 'Currency Converter', path: '/ledger/converter', icon: DollarSign },
      ]
    },
    {
      title: 'CRM & Work',
      items: [
        { name: 'Projects', path: '/work/projects', icon: FolderKanban },
        { name: 'Personal Tasks', path: '/work/tasks', icon: CheckSquare },
      ]
    },
    {
      title: 'Communications',
      items: [
        { name: 'WhatsApp Copilot', path: '/comms/whatsapp', icon: MessageSquare },
        { name: 'AI Agents', path: '/ai-agents', icon: Bot },
      ]
    }
  ];

  return (
    <div className="fixed inset-0 z-[150] flex md:hidden animate-in fade-in duration-200">
      {/* Backdrop Overlay */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Slide-out Panel */}
      <div className="relative w-4/5 max-w-xs bg-card h-full flex flex-col border-r border-border shadow-2xl z-10 animate-in slide-in-from-left duration-300">
        {/* Drawer Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30 pt-safe">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-primary text-primary-foreground rounded-xl shadow-sm">
              <Layers size={18} />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-foreground tracking-tight">The Base</h2>
              <p className="text-[10px] text-muted-foreground font-mono truncate max-w-[140px]">
                {user?.email || 'Workspace'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground rounded-xl hover:bg-muted transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Quick Toggles Bar */}
        <div className="p-3 border-b border-border/60 bg-muted/10 grid grid-cols-2 gap-2">
          <button
            onClick={toggleTheme}
            className="flex items-center justify-center gap-1.5 p-2 bg-card border border-border/60 rounded-xl text-xs font-semibold text-foreground hover:bg-muted transition-all"
          >
            {isDarkMode ? <Sun size={14} className="text-amber-400" /> : <Moon size={14} className="text-indigo-400" />}
            <span>{isDarkMode ? 'Light' : 'Dark'}</span>
          </button>

          <button
            onClick={togglePrivacyMode}
            className={`flex items-center justify-center gap-1.5 p-2 border rounded-xl text-xs font-semibold transition-all ${
              isPrivacyMode
                ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                : 'bg-card border-border/60 text-foreground hover:bg-muted'
            }`}
          >
            {isPrivacyMode ? <EyeOff size={14} /> : <Eye size={14} />}
            <span>{isPrivacyMode ? 'Privacy ON' : 'Privacy'}</span>
          </button>
        </div>

        {/* Drawer Content — Scrollable Sections */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {/* Home Link */}
          <Link
            to="/"
            onClick={handleNavClick}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
              location.pathname === '/'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Home size={16} />
            <span>Home Dashboard</span>
          </Link>

          {/* AI Copilot Prompt */}
          <Link
            to="/ai"
            onClick={handleNavClick}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-extrabold transition-all border ${
              location.pathname === '/ai'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-primary/5 text-primary border-primary/20 hover:bg-primary/10'
            }`}
          >
            <Sparkles size={16} />
            <span>AI Copilot</span>
            <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded font-mono font-bold bg-primary/20">
              AI
            </span>
          </Link>

          {/* Module Sections */}
          {navSections.map(section => (
            <div key={section.title} className="space-y-1">
              <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider px-3">
                {section.title}
              </span>
              <div className="space-y-0.5 pt-1">
                {section.items.map(item => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={handleNavClick}
                      className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                        isActive
                          ? 'bg-primary/10 text-primary font-bold'
                          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                      }`}
                    >
                      <Icon size={15} className={isActive ? 'text-primary' : 'opacity-70'} />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Settings & System Links */}
          <div className="pt-2 border-t border-border/40 space-y-1">
            <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider px-3">
              System
            </span>
            <Link
              to="/settings"
              onClick={handleNavClick}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
                location.pathname === '/settings'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Settings size={16} />
              <span>App Settings</span>
            </Link>

            <Link
              to="/admin"
              onClick={handleNavClick}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-amber-500 hover:bg-amber-500/10 transition-all`}
            >
              <ShieldCheck size={16} />
              <span>Admin Console</span>
            </Link>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-border bg-muted/20 pb-safe">
          <button
            onClick={() => {
              onClose();
              onSignOut();
            }}
            className="flex items-center justify-center gap-2 w-full py-2.5 px-3 rounded-xl text-xs font-bold text-destructive bg-destructive/10 hover:bg-destructive/20 transition-colors"
          >
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
