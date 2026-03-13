import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SQLiteProvider } from './contexts/SQLiteContext';
import { SyncProvider } from './contexts/SyncContext';
import { CurrencyProvider } from './contexts/CurrencyContext';
import { Toaster } from 'sonner';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import AddTransaction from './pages/AddTransaction';
import Categories from './pages/Categories';
import Settings from './pages/Settings';
import Accounts from './pages/Accounts';

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

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SQLiteProvider>
          <SyncProvider>
            <CurrencyProvider>
              <Toaster position="top-center" richColors closeButton visibleToasts={3} />
              <Routes>
                <Route path="/login" element={<Login />} />
                
                <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                  <Route index element={<Dashboard />} />
                  <Route path="transactions" element={<Transactions />} />
                  <Route path="add" element={<AddTransaction />} />
                  <Route path="edit/:id" element={<AddTransaction />} />
                  <Route path="categories" element={<Categories />} />
                  <Route path="accounts" element={<Accounts />} />
                  <Route path="settings" element={<Settings />} />
                </Route>
              </Routes>
            </CurrencyProvider>
          </SyncProvider>
        </SQLiteProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
