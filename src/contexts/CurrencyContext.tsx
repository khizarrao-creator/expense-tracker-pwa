import React, { createContext, useContext, useState, useEffect } from 'react';

type Currency = {
  code: string;
  symbol: string;
  name: string;
};

const currencies: Currency[] = [
  { code: 'PKR', symbol: 'Rs', name: 'Pakistani Rupee' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  { code: 'SAR', symbol: 'ر.س', name: 'Saudi Riyal' },
];

interface CurrencyContextType {
  currency: Currency;
  setCurrency: (code: string) => void;
  formatAmount: (amount: number) => string;
  currencies: Currency[];
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currency, setCurrencyState] = useState<Currency>(currencies[0]); // Default PKR

  useEffect(() => {
    const loadCurrency = () => {
      const savedCode = localStorage.getItem('currency');
      if (savedCode) {
        const found = currencies.find(c => c.code === savedCode);
        if (found) setCurrencyState(found);
      }
    };
    
    loadCurrency();

    // Listen for sync changes
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'currency') loadCurrency();
    };
    window.addEventListener('storage', handleStorage);
    
    // Custom event for internal sync refreshes
    const handleSync = () => loadCurrency();
    window.addEventListener('app-sync-complete', handleSync);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('app-sync-complete', handleSync);
    };
  }, []);

  const setCurrency = (code: string) => {
    const found = currencies.find(c => c.code === code);
    if (found) {
      setCurrencyState(found);
      localStorage.setItem('currency', code);
    }
  };

  const formatAmount = (amount: number) => {
    return `${currency.symbol}${amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, formatAmount, currencies }}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
};
