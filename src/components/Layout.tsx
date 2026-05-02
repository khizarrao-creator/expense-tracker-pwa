import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, List, PlusCircle, Settings, LogOut, CloudSync, Landmark, Book, LayoutGrid } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSync } from '../contexts/SyncContext';

const Layout: React.FC = () => {
  const { signOut } = useAuth();
  const { isSyncing, lastSynced, isOnline } = useSync();
  const location = useLocation();

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Transactions', path: '/transactions', icon: List },
    { name: 'Add', path: '/add', icon: PlusCircle },
    { name: 'Accounts', path: '/accounts', icon: Landmark },
    { name: 'More', path: '/more', icon: LayoutGrid },
    { name: 'Settings', path: '/settings', icon: Settings },
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
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-card border-r border-border">
        <div className="p-6">
          <h1 className="text-2xl font-bold tracking-tight text-primary flex items-center gap-2">
            <span className="bg-primary text-primary-foreground p-1 rounded-md shadow-sm">
              <Book size={20} />
            </span>
            Ledger
          </h1>
          {!isOnline && (
            <div className="mt-2 text-[10px] bg-destructive/10 text-destructive px-2 py-1 rounded-full font-bold flex items-center gap-1">
              <div className="w-1.5 h-1.5 bg-destructive rounded-full animate-pulse" />
              OFFLINE MODE
            </div>
          )}
        </div>

        <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
              >
                <Icon size={20} />
                <span className="font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
            <CloudSync size={14} className={isSyncing ? 'animate-spin text-primary' : ''} />
            {isSyncing ? 'Syncing...' : `Last sync: ${lastSynced ? lastSynced.toLocaleTimeString() : 'Never'}`}
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-4 py-2 w-full rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <LogOut size={20} />
            <span className="font-medium">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden bg-card border-b border-border p-4 flex items-center justify-between z-10">
          <div className="flex flex-col">
            <h1 className="text-xl font-bold tracking-tight text-primary">Ledger</h1>
            {!isOnline && (
              <span className="text-[10px] text-destructive font-bold uppercase tracking-wider">Offline</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <CloudSync size={20} className={isSyncing ? 'animate-spin text-primary' : 'text-muted-foreground'} />
            <button onClick={handleSignOut} className="text-muted-foreground">
              <LogOut size={20} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8">
          <Outlet />
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 w-full bg-card border-t border-border flex justify-around p-2 pb-safe z-20">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path)) ||
            (item.path === '/add' && location.pathname.startsWith('/edit'));
          return (
            <Link
              key={item.name}
              to={item.path}
              className={`flex flex-col items-center p-2 rounded-lg ${isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
            >
              <Icon size={24} className={isActive ? 'mb-1' : 'mb-1 opacity-70'} />
              <span className="text-[10px] font-medium">{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
};

export default Layout;
