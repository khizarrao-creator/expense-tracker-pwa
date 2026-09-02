import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SQLiteProvider } from './contexts/SQLiteContext';
import { SyncProvider } from './contexts/SyncContext';
import { CurrencyProvider } from './contexts/CurrencyContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { AppProvider, useApp } from './contexts/AppContext';
import { Toaster } from 'sonner';
import { useTaskReminders } from './hooks/useTaskReminders';
import { useWhatsAppBillReminders } from './hooks/useWhatsAppBillReminders';
import Layout from './components/Layout';
import { UpgradePrompt } from './components/UpgradePrompt';
import { Loader2 } from 'lucide-react';

// Lazy load page components for route code-splitting
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Transactions = lazy(() => import('./pages/Transactions'));
const AddTransaction = lazy(() => import('./pages/AddTransaction'));
const Categories = lazy(() => import('./pages/Categories'));
const Settings = lazy(() => import('./pages/Settings'));
const Accounts = lazy(() => import('./pages/Accounts'));
const Goals = lazy(() => import('./pages/Goals'));
const Investments = lazy(() => import('./pages/Investments'));
const Reminders = lazy(() => import('./pages/Reminders'));
const More = lazy(() => import('./pages/More'));
const Calculator = lazy(() => import('./pages/Calculator'));
const Converter = lazy(() => import('./pages/Converter'));
const Tasks = lazy(() => import('./pages/Tasks'));
const Loans = lazy(() => import('./pages/Loans'));
const Events = lazy(() => import('./pages/Events'));
const FuelTracking = lazy(() => import('./pages/FuelTracking'));
const Reports = lazy(() => import('./pages/Reports'));
const Admin = lazy(() => import('./pages/Admin'));
const MexcDetails = lazy(() => import('./pages/MexcDetails'));
const AIChat = lazy(() => import('./pages/AIChat'));
const Subscriptions = lazy(() => import('./pages/Subscriptions'));
const WhatsApp = lazy(() => import('./pages/WhatsApp'));
const Projects = lazy(() => import('./pages/Projects'));
const Upgrade = lazy(() => import('./pages/Upgrade').then(m => ({ default: m.Upgrade })));
const Subscription = lazy(() => import('./pages/Subscription').then(m => ({ default: m.Subscription })));

const BaseDashboard = lazy(() => import('./pages/BaseDashboard').then(m => ({ default: m.BaseDashboard })));

const SuspenseSpinner: React.FC = () => (
  <div className="flex h-[60vh] w-full items-center justify-center bg-background text-foreground">
    <div className="flex flex-col items-center gap-3">
      <Loader2 className="animate-spin text-primary" size={32} />
      <span className="text-xs text-muted-foreground font-semibold">Loading Page...</span>
    </div>
  </div>
);

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

import { WorkProvider } from './contexts/WorkContext';

const ProjectList = lazy(() => import('./pages/work/ProjectList').then(m => ({ default: m.ProjectList })));
const ProjectLayout = lazy(() => import('./pages/work/ProjectLayout').then(m => ({ default: m.ProjectLayout })));
const ProjectDashboard = lazy(() => import('./pages/work/ProjectDashboard').then(m => ({ default: m.ProjectDashboard })));
const ProjectTasks = lazy(() => import('./pages/work/ProjectTasks').then(m => ({ default: m.ProjectTasks })));
const ProjectLeads = lazy(() => import('./pages/work/ProjectLeads').then(m => ({ default: m.ProjectLeads })));
const ProjectMembers = lazy(() => import('./pages/work/ProjectMembers').then(m => ({ default: m.ProjectMembers })));
const ProjectCustomers = lazy(() => import('./pages/work/ProjectCustomers').then(m => ({ default: m.ProjectCustomers })));
const ProjectSheets = lazy(() => import('./pages/work/ProjectSheets').then(m => ({ default: m.ProjectSheets })));
const ProjectAIChat = lazy(() => import('./pages/work/ProjectAIChat').then(m => ({ default: m.ProjectAIChat })));
const ProjectWhatsApp = lazy(() => import('./pages/work/ProjectWhatsApp').then(m => ({ default: m.ProjectWhatsApp })));
const ProjectWhiteboard = lazy(() => import('./pages/work/ProjectWhiteboard').then(m => ({ default: m.ProjectWhiteboard })));
const ProjectSettings = lazy(() => import('./pages/work/ProjectSettings').then(m => ({ default: m.ProjectSettings })));

const FeatureRoute: React.FC<{ featureId: string; children: React.ReactNode }> = ({ featureId, children }) => {
  const { config, disabledFeatures, planFeatures } = useApp();
  
  const isGlobalDisabled = config.disabledFeatures?.includes(featureId);
  const isUserDisabled = disabledFeatures?.includes(featureId);
  const isLegacyDisabled = 
    (featureId === 'fuel' && !config.fuelTrackingEnabled) ||
    (featureId === 'loans' && !config.loansEnabled);

  if (isGlobalDisabled || isUserDisabled || isLegacyDisabled) {
    return <Navigate to="/more" replace />;
  }

  // Validate feature against user plan tier
  if (planFeatures && !planFeatures.includes(featureId)) {
    return <UpgradePrompt featureId={featureId} />;
  }

  return <>{children}</>;
};

const AppHooks: React.FC = () => {
  // Global hooks
  useTaskReminders();
  useWhatsAppBillReminders();
  return null;
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppProvider>
          <WorkProvider>
            <SQLiteProvider>
              <SyncProvider>
                <CurrencyProvider>
                  <ThemeProvider>
                    <AppHooks />
                    <Toaster position="top-center" richColors closeButton visibleToasts={3} />
                    <Suspense fallback={<SuspenseSpinner />}>
                      <Routes>
                        <Route path="/login" element={<Login />} />
                        
                        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                          <Route index element={<BaseDashboard />} />
                          
                          {/* 📊 LEDGER — Complete Financial Suite */}
                          <Route path="ledger/overview" element={<Dashboard />} />
                          <Route path="ledger/transactions" element={<Transactions />} />
                          <Route path="ledger/accounts" element={<Accounts />} />
                          <Route path="ledger/categories" element={<Categories />} />
                          <Route path="ledger/goals" element={<FeatureRoute featureId="goals"><Goals /></FeatureRoute>} />
                          <Route path="ledger/investments" element={<FeatureRoute featureId="investments"><Investments /></FeatureRoute>} />
                          <Route path="ledger/loans" element={<FeatureRoute featureId="loans"><Loans /></FeatureRoute>} />
                          <Route path="ledger/subscriptions" element={<FeatureRoute featureId="subscriptions"><Subscriptions /></FeatureRoute>} />
                          <Route path="ledger/reminders" element={<FeatureRoute featureId="reminders"><Reminders /></FeatureRoute>} />
                          <Route path="ledger/events" element={<FeatureRoute featureId="events"><Events /></FeatureRoute>} />
                          <Route path="ledger/vehicles" element={<FeatureRoute featureId="fuel"><FuelTracking /></FeatureRoute>} />
                          <Route path="ledger/reports" element={<FeatureRoute featureId="reports"><Reports /></FeatureRoute>} />
                          <Route path="ledger/calculator" element={<FeatureRoute featureId="calculator"><Calculator /></FeatureRoute>} />
                          <Route path="ledger/converter" element={<FeatureRoute featureId="converter"><Converter /></FeatureRoute>} />

                          {/* 💼 WORK — Unified Work Engine */}
                          <Route path="work/projects" element={<FeatureRoute featureId="projects"><ProjectList /></FeatureRoute>} />
                          <Route path="work/projects/:projectId" element={<FeatureRoute featureId="projects"><ProjectLayout /></FeatureRoute>}>
                            <Route index element={<ProjectDashboard />} />
                            <Route path="tasks" element={<ProjectTasks />} />
                            <Route path="leads" element={<ProjectLeads />} />
                            <Route path="members" element={<ProjectMembers />} />
                            <Route path="customers" element={<ProjectCustomers />} />
                            <Route path="sheets" element={<ProjectSheets />} />
                            <Route path="ai" element={<ProjectAIChat />} />
                            <Route path="whatsapp" element={<ProjectWhatsApp />} />
                            <Route path="whiteboard" element={<ProjectWhiteboard />} />
                            <Route path="settings" element={<ProjectSettings />} />
                          </Route>
                          <Route path="work/tasks" element={<FeatureRoute featureId="tasks"><Tasks /></FeatureRoute>} />

                        {/* 💬 COMMUNICATIONS */}
                        <Route path="comms/whatsapp" element={<FeatureRoute featureId="whatsapp"><WhatsApp /></FeatureRoute>} />

                        {/* 🤖 AI COPILOT — Cross-cutting Intelligence Layer */}
                        <Route path="ai" element={<FeatureRoute featureId="ai-chat"><AIChat /></FeatureRoute>} />

                        {/* ⚙️ Settings & Admin */}
                        <Route path="settings" element={<Settings />} />
                        <Route path="more" element={<More />} />
                        <Route path="add" element={<AddTransaction />} />
                        <Route path="edit/:id" element={<AddTransaction />} />
                        <Route path="mexc-details/:id" element={<MexcDetails />} />
                        <Route path="upgrade" element={<Upgrade />} />
                        <Route path="subscription" element={<Subscription />} />

                        {/* 🔄 Backward Compatibility Aliases */}
                        <Route path="ledger/dashboard" element={<Dashboard />} />
                        <Route path="transactions" element={<Transactions />} />
                        <Route path="categories" element={<Categories />} />
                        <Route path="accounts" element={<Accounts />} />
                        <Route path="goals" element={<FeatureRoute featureId="goals"><Goals /></FeatureRoute>} />
                        <Route path="reminders" element={<FeatureRoute featureId="reminders"><Reminders /></FeatureRoute>} />
                        <Route path="investments" element={<FeatureRoute featureId="investments"><Investments /></FeatureRoute>} />
                        <Route path="calculator" element={<FeatureRoute featureId="calculator"><Calculator /></FeatureRoute>} />
                        <Route path="converter" element={<FeatureRoute featureId="converter"><Converter /></FeatureRoute>} />
                        <Route path="tasks" element={<FeatureRoute featureId="tasks"><Tasks /></FeatureRoute>} />
                        <Route path="loans" element={<FeatureRoute featureId="loans"><Loans /></FeatureRoute>} />
                        <Route path="events" element={<FeatureRoute featureId="events"><Events /></FeatureRoute>} />
                        <Route path="fuel" element={<FeatureRoute featureId="fuel"><FuelTracking /></FeatureRoute>} />
                        <Route path="reports" element={<FeatureRoute featureId="reports"><Reports /></FeatureRoute>} />
                        <Route path="ai-chat" element={<FeatureRoute featureId="ai-chat"><AIChat /></FeatureRoute>} />
                        <Route path="ai/chat" element={<FeatureRoute featureId="ai-chat"><AIChat /></FeatureRoute>} />
                        <Route path="subscriptions" element={<FeatureRoute featureId="subscriptions"><Subscriptions /></FeatureRoute>} />
                        <Route path="whatsapp" element={<FeatureRoute featureId="whatsapp"><WhatsApp /></FeatureRoute>} />
                        <Route path="projects" element={<FeatureRoute featureId="projects"><Projects /></FeatureRoute>} />
                        <Route path="ops/vehicles" element={<FeatureRoute featureId="fuel"><FuelTracking /></FeatureRoute>} />
                        <Route path="ops/loans" element={<FeatureRoute featureId="loans"><Loans /></FeatureRoute>} />
                        <Route path="ops/events" element={<FeatureRoute featureId="events"><Events /></FeatureRoute>} />
                        <Route path="ops/tasks" element={<FeatureRoute featureId="tasks"><Tasks /></FeatureRoute>} />
                        <Route path="ops/reminders" element={<FeatureRoute featureId="reminders"><Reminders /></FeatureRoute>} />
                      </Route>
                      <Route path="/admin" element={<Admin />} />
                      <Route path="/admin/payments" element={<Admin />} />
                    </Routes>
                  </Suspense>
                </ThemeProvider>
              </CurrencyProvider>
            </SyncProvider>
          </SQLiteProvider>
        </WorkProvider>
      </AppProvider>
    </AuthProvider>
  </BrowserRouter>
);
};

export default App;
