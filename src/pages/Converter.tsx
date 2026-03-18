import React, { useState, useEffect } from 'react';
import { ArrowUpDown, RefreshCw, DollarSign } from 'lucide-react';
import { toast } from 'sonner';

const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'PKR', symbol: 'Rs', name: 'Pakistani Rupee' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  { code: 'SAR', symbol: 'ر.س', name: 'Saudi Riyal' }
];

const Converter: React.FC = () => {
  const [rates, setRates] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [amountFrom, setAmountFrom] = useState<string>('1');
  const [currencyFrom, setCurrencyFrom] = useState('USD');
  const [currencyTo, setCurrencyTo] = useState('PKR');

  const [useCustomRate, setUseCustomRate] = useState(false);
  const [customRate, setCustomRate] = useState<string>('');

  useEffect(() => {
    fetchRates();
  }, []);

  const fetchRates = async () => {
    setLoading(true);
    try {
      // Using a free, public exchange rate API (base USD)
      const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      if (!res.ok) throw new Error('Failed to fetch rates');
      const data = await res.json();
      setRates(data.rates);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error fetching rates:', error);
      toast.error('Could not fetch latest rates. Using fallback rates.');
      // Fallback rough rates if offline
      setRates({
        USD: 1,
        EUR: 0.92,
        GBP: 0.79,
        PKR: 280.0,
        AED: 3.67,
        SAR: 3.75
      });
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  };

  const handleSwap = () => {
    setCurrencyFrom(currencyTo);
    setCurrencyTo(currencyFrom);
  };

  const getConvertedAmount = (): string => {
    if (!amountFrom || isNaN(Number(amountFrom))) return '0.00';

    const amount = parseFloat(amountFrom);
    let finalAmount = 0;

    if (useCustomRate && customRate && !isNaN(Number(customRate))) {
      finalAmount = amount * parseFloat(customRate);
    } else {
      if (Object.keys(rates).length === 0) return '0.00';
      const rateFrom = rates[currencyFrom] || 1;
      const rateTo = rates[currencyTo] || 1;
      const amountInUSD = amount / rateFrom;
      finalAmount = amountInUSD * rateTo;
    }

    return finalAmount.toFixed(2);
  };

  const getExchangeRateLabel = () => {
    if (useCustomRate && customRate) return parseFloat(customRate).toFixed(4);
    if (Object.keys(rates).length === 0) return '0.0000';
    const rateFrom = rates[currencyFrom] || 1;
    const rateTo = rates[currencyTo] || 1;
    return (rateTo / rateFrom).toFixed(4);
  };

  const googleSearchUrl = `https://www.google.com/search?q=${amountFrom}+${currencyFrom}+to+${currencyTo}`;

  return (
    <div className="max-w-md mx-auto h-full flex flex-col space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <div className="bg-primary/10 text-primary p-1.5 rounded-lg">
            <DollarSign size={20} />
          </div>
          Converter
        </h1>
        <button
          onClick={fetchRates}
          disabled={loading}
          className="p-2 text-muted-foreground hover:text-primary transition-colors hover:bg-muted rounded-full"
          title="Refresh Rates"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="bg-card border border-border rounded-3xl p-6 shadow-sm">

        {/* From Section */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">You Send</label>
          <div className="flex items-center bg-muted/50 rounded-2xl p-2 border border-border/50 focus-within:border-primary/50 transition-colors">
            <select
              value={currencyFrom}
              onChange={(e) => setCurrencyFrom(e.target.value)}
              className="bg-transparent border-none focus:outline-none focus:ring-0 font-semibold text-foreground py-3 pl-3 pr-8 appearance-none cursor-pointer"
            >
              {CURRENCIES.map(c => (
                <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>
              ))}
            </select>
            <input
              type="number"
              value={amountFrom}
              onChange={(e) => setAmountFrom(e.target.value)}
              placeholder="0.00"
              className="flex-1 bg-transparent text-right text-2xl font-bold text-foreground focus:outline-none border-none min-w-0 pr-4"
            />
          </div>
        </div>

        {/* Swap Button */}
        <div className="flex justify-center -my-3 relative z-10">
          <button
            onClick={handleSwap}
            className="bg-card border-2 border-border p-2 rounded-full text-muted-foreground hover:text-primary hover:border-primary/50 transition-all shadow-sm active:scale-95"
          >
            <ArrowUpDown size={20} />
          </button>
        </div>

        {/* To Section */}
        <div className="space-y-2 mt-2 border-b border-border/50 pb-6 mb-4">
          <label className="text-sm font-medium text-muted-foreground flex justify-between">
            <span>You Get</span>
            {loading ? (
              <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full animate-pulse">updating...</span>
            ) : null}
          </label>
          <div className="flex items-center bg-muted/20 rounded-2xl p-2 border border-border/50">
            <select
              value={currencyTo}
              onChange={(e) => setCurrencyTo(e.target.value)}
              className="bg-transparent border-none focus:outline-none focus:ring-0 font-semibold text-foreground py-3 pl-3 pr-8 appearance-none cursor-pointer"
            >
              {CURRENCIES.map(c => (
                <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>
              ))}
            </select>
            <div className="flex-1 text-right text-3xl font-bold text-primary pr-4 overflow-hidden text-ellipsis">
              {getConvertedAmount()}
            </div>
          </div>
        </div>

        {/* Custom Rate Override */}
        <div className="pt-2">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-foreground">Custom Exchange Rate</label>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" checked={useCustomRate} onChange={(e) => setUseCustomRate(e.target.checked)} />
              <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          {useCustomRate && (
            <div className="flex items-center gap-2 bg-muted/30 p-3 rounded-xl border border-border">
              <span className="text-sm text-muted-foreground font-medium">1 {currencyFrom} = </span>
              <input
                type="number"
                value={customRate}
                onChange={(e) => setCustomRate(e.target.value)}
                placeholder={getExchangeRateLabel()}
                className="flex-1 bg-transparent text-right font-bold text-foreground focus:outline-none border-b border-border focus:border-primary px-2 min-w-0"
              />
              <span className="text-sm text-muted-foreground font-medium">{currencyTo}</span>
            </div>
          )}
        </div>

      </div>

      <div className="text-center text-xs text-muted-foreground pt-2 space-y-2">
        {lastUpdated ? (
          <p>Exchange rates updated: {lastUpdated.toLocaleTimeString()}</p>
        ) : (
          <p>Fetching latest rates...</p>
        )}
        <p className="opacity-80 mx-auto max-w-sm leading-relaxed">
          Exchange rates can differ by 1-3 rupees (or ~1%) from local market spots.
          You can verify against <a href={googleSearchUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">Google Rates</a> and apply a custom manual rate above if needed.
        </p>
      </div>

    </div>
  );
};

export default Converter;
