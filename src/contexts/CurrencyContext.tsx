import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useApp } from './AppContext';

type Currency = {
  code: string;
  symbol: string;
  name: string;
};

const DEFAULT_CURRENCIES: Currency[] = [
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
  const { config } = useApp();
  const currencies = useMemo(() => config.supportedCurrencies || DEFAULT_CURRENCIES, [config.supportedCurrencies]);
  
  const [currency, setCurrencyState] = useState<Currency>(currencies[0] || DEFAULT_CURRENCIES[0]); 

  useEffect(() => {
    const loadCurrency = () => {
      const savedCode = localStorage.getItem('currency');
      if (savedCode) {
        const found = currencies.find(c => c.code === savedCode);
        if (found) setCurrencyState(found);
      }
    };
    
    loadCurrency();

    // Re-check if current currency is still valid when currencies list changes
    const currentValid = currencies.find(c => c.code === currency.code);
    if (!currentValid && currencies.length > 0) {
      setCurrencyState(currencies[0]);
    }

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
