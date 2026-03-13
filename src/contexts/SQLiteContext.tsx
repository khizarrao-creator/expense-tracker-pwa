import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { initDB } from '../db/sqlite';

interface SQLiteContextProps {
  isReady: boolean;
  error: Error | null;
}

const SQLiteContext = createContext<SQLiteContextProps>({
  isReady: false,
  error: null,
});

export const useSQLite = () => useContext(SQLiteContext);

export const SQLiteProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const setup = async () => {
      try {
        await initDB();
        setIsReady(true);
      } catch (err) {
        console.error('Failed to initialize SQLite:', err);
        setError(err instanceof Error ? err : new Error('Unknown error during SQLite initialization'));
      }
    };

    setup();
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4 text-center">
        <div className="bg-destructive/10 text-destructive p-4 rounded-lg max-w-md w-full">
          <h2 className="text-lg font-semibold mb-2">Database Error</h2>
          <p>{error.message}</p>
        </div>
      </div>
    );
  }

  if (!isReady) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <SQLiteContext.Provider value={{ isReady, error }}>
      {children}
    </SQLiteContext.Provider>
  );
};
