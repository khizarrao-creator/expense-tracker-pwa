import React from 'react';
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
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import AddTransaction from './pages/AddTransaction';
import Categories from './pages/Categories';
import Settings from './pages/Settings';
import Accounts from './pages/Accounts';
import Goals from './pages/Goals';
import Investments from './pages/Investments';
import Reminders from './pages/Reminders';
import More from './pages/More';
import Calculator from './pages/Calculator';
import Converter from './pages/Converter';
import Tasks from './pages/Tasks';
import Loans from './pages/Loans';
import Events from './pages/Events';
import FuelTracking from './pages/FuelTracking';
import Reports from './pages/Reports';
import Admin from './pages/Admin';
import MexcDetails from './pages/MexcDetails';
import AIChat from './pages/AIChat';
import Subscriptions from './pages/Subscriptions';
import WhatsApp from './pages/WhatsApp';

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

const FeatureRoute: React.FC<{ featureId: string; children: React.ReactNode }> = ({ featureId, children }) => {
  const { config, disabledFeatures } = useApp();
  
  const isGlobalDisabled = config.disabledFeatures?.includes(featureId);
  const isUserDisabled = disabledFeatures?.includes(featureId);
  const isLegacyDisabled = 
    (featureId === 'fuel' && !config.fuelTrackingEnabled) ||
    (featureId === 'loans' && !config.loansEnabled);

  if (isGlobalDisabled || isUserDisabled || isLegacyDisabled) {
    return <Navigate to="/more" replace />;
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
          <SQLiteProvider>
            <SyncProvider>
              <CurrencyProvider>
                <ThemeProvider>
                  <AppHooks />
                  <Toaster position="top-center" richColors closeButton visibleToasts={3} />
                  <Toaster position="top-right" richColors closeButton visibleToasts={1} toastOptions={{ className: 'whisper-download-toaster' }} />
                  <Routes>
                    <Route path="/login" element={<Login />} />
                    
                    <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                      <Route index element={<Dashboard />} />
                      <Route path="transactions" element={<Transactions />} />
                      <Route path="add" element={<AddTransaction />} />
                      <Route path="edit/:id" element={<AddTransaction />} />
                      <Route path="categories" element={<Categories />} />
                      <Route path="accounts" element={<Accounts />} />
                      <Route path="goals" element={<FeatureRoute featureId="goals"><Goals /></FeatureRoute>} />
                      <Route path="reminders" element={<FeatureRoute featureId="reminders"><Reminders /></FeatureRoute>} />
                      <Route path="investments" element={<FeatureRoute featureId="investments"><Investments /></FeatureRoute>} />
                      <Route path="more" element={<More />} />
                      <Route path="calculator" element={<FeatureRoute featureId="calculator"><Calculator /></FeatureRoute>} />
                      <Route path="converter" element={<FeatureRoute featureId="converter"><Converter /></FeatureRoute>} />
                      <Route path="tasks" element={<FeatureRoute featureId="tasks"><Tasks /></FeatureRoute>} />
                      <Route path="loans" element={<FeatureRoute featureId="loans"><Loans /></FeatureRoute>} />
                      <Route path="events" element={<FeatureRoute featureId="events"><Events /></FeatureRoute>} />
                      <Route path="fuel" element={<FeatureRoute featureId="fuel"><FuelTracking /></FeatureRoute>} />
                      <Route path="reports" element={<FeatureRoute featureId="reports"><Reports /></FeatureRoute>} />
                      <Route path="settings" element={<Settings />} />
                      <Route path="mexc-details/:id" element={<MexcDetails />} />
                      <Route path="ai-chat" element={<FeatureRoute featureId="ai-chat"><AIChat /></FeatureRoute>} />
                      <Route path="subscriptions" element={<FeatureRoute featureId="subscriptions"><Subscriptions /></FeatureRoute>} />
                      <Route path="whatsapp" element={<FeatureRoute featureId="whatsapp"><WhatsApp /></FeatureRoute>} />
                    </Route>
                    <Route path="/admin" element={<Admin />} />
                  </Routes>
                </ThemeProvider>
              </CurrencyProvider>
            </SyncProvider>
          </SQLiteProvider>
        </AppProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
