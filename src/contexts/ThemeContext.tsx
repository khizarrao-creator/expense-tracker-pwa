import React, { createContext, useContext, useState, useEffect } from 'react';

type Theme = 'light' | 'dark' | 'eye-comfort' | 'system' | 'system-comfort';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    return (localStorage.getItem('theme') as Theme) || 'system';
  });

  const applyTheme = (currentTheme: Theme) => {
    const root = window.document.documentElement;
    
    let effectiveTheme = currentTheme;
    if (currentTheme === 'system') {
      effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } else if (currentTheme === 'system-comfort') {
      effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'eye-comfort' : 'light';
    }

    // Reset classes
    root.classList.remove('dark', 'eye-comfort');

    if (effectiveTheme === 'dark') {
      root.classList.add('dark');
    } else if (effectiveTheme === 'eye-comfort') {
      root.classList.add('eye-comfort');
    }
  };

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem('theme', theme);

    // Listen for system theme changes if set to system or system-comfort
    if (theme === 'system' || theme === 'system-comfort') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => applyTheme(theme);
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme]);

  useEffect(() => {
    // Listen for sync changes or other tab changes
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'theme') {
        setThemeState(e.newValue as Theme);
      }
    };

    const handleSync = () => {
      const saved = localStorage.getItem('theme') as Theme;
      if (saved) setThemeState(saved);
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('app-sync-complete', handleSync);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('app-sync-complete', handleSync);
    };
  }, []);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
