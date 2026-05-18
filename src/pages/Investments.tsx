import React, { useState, useEffect } from 'react';
import {
  Plus,
  TrendingUp,
  TrendingDown,
  Coins,
  BarChart3,
  Trash2,
  X,
  RefreshCw,
  Wallet,
  Edit3,
  PlusCircle,
  History,
  BookOpen
} from 'lucide-react';
import {
  getInvestments,
  addInvestment,
  deleteInvestment,
  type Investment,
  getAccounts,
  type Account,
  fetchCryptoPrice,
  fetchGoldPrice,
  getConfig,
  updateInvestment,
  updateInvestmentInMemory,
  addAssetTransaction,
  deleteAssetTransaction,
  getAssetTransactions,
  getInventoryLedger,
  type AssetTransaction,
  type InventoryLedger,
  syncMexcTradesToAssetTransactions
} from '../db/queries';
import { useCurrency } from '../contexts/CurrencyContext';
import { toast } from 'sonner';

const Investments: React.FC = () => {
  const { formatAmount, currencies, currency: baseCurrency } = useCurrency();
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [totalValue, setTotalValue] = useState(0);
  const [profitLoss, setProfitLoss] = useState({ profit_loss: 0, profit_loss_pct: 0 });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editingInvestment, setEditingInvestment] = useState<Investment | null>(null);

  const [mexcApiKey, setMexcApiKey] = useState('');
  const [mexcBalances, setMexcBalances] = useState<any[]>([]);
  const [loadingMexc, setLoadingMexc] = useState(false);
  const [fetchingMexcAssetDetails, setFetchingMexcAssetDetails] = useState(false);

  // Double-Entry Ledger State
  const [activeSubTab, setActiveSubTab] = useState<'portfolio' | 'transactions' | 'ledger'>('portfolio');
  const [assetTransactions, setAssetTransactions] = useState<AssetTransaction[]>([]);
  const [inventoryLedger, setInventoryLedger] = useState<InventoryLedger[]>([]);
  const [txnType, setTxnType] = useState<'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAWAL'>('BUY');
  const [quoteAsset, setQuoteAsset] = useState('USDT');
  const [feeAsset, setFeeAsset] = useState('');
  const [feeQty, setFeeQty] = useState('0');
  const [syncingMexcTrades, setSyncingMexcTrades] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [type, setType] = useState('Stock');
  const [units, setUnits] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState(baseCurrency.code);
  const [buyExchangeRate, setBuyExchangeRate] = useState('1');
  const [currentExchangeRate, setCurrentExchangeRate] = useState('1');
  const [fundingAccountId, setFundingAccountId] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Run silent ledger WAC replay to automatically clean and merge any mixed-case duplicates!
      const { replayInventoryLedger } = await import('../db/queries');
      await replayInventoryLedger();

      // 2. Fetch freshly calculated clean assets
      const [invList, accList, mKey, mSecret, txList, ledgList] = await Promise.all([
        getInvestments(),
        getAccounts(),
        getConfig('mexc_api_key'),
        getConfig('mexc_api_secret'),
        getAssetTransactions(),
        getInventoryLedger()
      ]);
      
      setInvestments(invList);
      setAccounts(accList);
      setMexcApiKey(mKey || '');
      setAssetTransactions(txList);
      setInventoryLedger(ledgList);

      if (mKey && mSecret) {
        fetchMexcBalances(mKey, mSecret);
      }

      // Recalculate totals based on base currency
      calculateTotals(invList);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchMexcBalances = async (key: string, secret: string) => {
    setLoadingMexc(true);
    try {
      const { getMEXCData } = await import('../db/queries');
      const data = await getMEXCData(key, secret);
      if (data && data.balances) {
        const filtered = data.balances.filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
        setMexcBalances(filtered);
      }
    } catch (error) {
      console.error('MEXC Fetch Error:', error);
    } finally {
      setLoadingMexc(false);
    }
  };
  const handleSyncMexcTrades = async () => {
    const key = await getConfig('mexc_api_key');
    const secret = await getConfig('mexc_api_secret');
    if (!key || !secret) {
      toast.error('Please configure MEXC API credentials in Settings first.');
      return;
    }
    
    setSyncingMexcTrades(true);
    const toastId = toast.loading('Syncing completed trade history from MEXC...');
    try {
      const uniqueSymbols = Array.from(new Set(mexcBalances.map(b => b.asset).filter(a => a !== 'USDT')));
      if (uniqueSymbols.length === 0) {
        toast.info('No active crypto assets found in exchange wallet to sync.', { id: toastId });
        return;
      }
      const count = await syncMexcTradesToAssetTransactions(key, secret, uniqueSymbols);
      toast.success(`Successfully imported ${count} trades and replayed accounting ledger!`, { id: toastId });
      loadData();
    } catch (error) {
      console.error('Failed to sync MEXC trades:', error);
      toast.error('Failed to sync trades from MEXC.', { id: toastId });
    } finally {
      setSyncingMexcTrades(false);
    }
  };
  const calculateTotals = (invList: Investment[]) => {
    let total = 0;
    let cost = 0;

    invList.forEach(inv => {
      const currentExRate = inv.current_exchange_rate || 1;
      const currentValBase = (inv.units * inv.current_price) * currentExRate;
      const costValBase = (inv.units * inv.average_buy_price) * inv.buy_exchange_rate;
      
      total += currentValBase;
      cost += costValBase;
    });

    setTotalValue(total);
    const pl = total - cost;
    const plPct = cost > 0 ? (pl / cost) * 100 : 0;
    setProfitLoss({ profit_loss: pl, profit_loss_pct: plPct });
  };

  useEffect(() => {
    loadData();
  }, [baseCurrency.code]);

  useEffect(() => {
    // Silent background prices auto-refresh every 2 seconds for real-time tickers!
    const intervalId = setInterval(() => {
      silentRefreshPrices();
    }, 2000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (isModalOpen) {
      fetchExchangeRate(selectedCurrency);
    }
  }, [selectedCurrency, isModalOpen]);

  const fetchExchangeRate = async (currencyCode: string) => {
    if (currencyCode === baseCurrency.code) {
      setBuyExchangeRate('1');
      if (editingInvestment) setCurrentExchangeRate('1');
      return;
    }
    
    try {
      const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${currencyCode}`);
      if (res.ok) {
        const data = await res.json();
        const rateToBase = data.rates[baseCurrency.code];
        if (rateToBase) {
          setBuyExchangeRate(rateToBase.toString());
          if (!editingInvestment) {
            setCurrentExchangeRate(rateToBase.toString());
          }
        }
      }
    } catch (e) {
      console.error('Failed to fetch exchange rate:', e);
    }
  };

  const fetchHistoricalExchangeRate = async (from: string, to: string, dateStr: string): Promise<number | null> => {
    if (from === to) return 1;
    try {
      const res = await fetch(`https://api.coinbase.com/v2/prices/${from.toUpperCase()}-${to.toUpperCase()}/spot?date=${dateStr}`);
      if (res.ok) {
        const json = await res.json();
        if (json.data && json.data.amount) {
          return parseFloat(json.data.amount);
        }
      }
      return null;
    } catch (e) {
      console.error('Failed to fetch historical exchange rate from Coinbase:', e);
      return null;
    }
  };

  const handleImportMexcAsset = async (assetSymbol: string) => {
    if (!assetSymbol) return;
    const holding = mexcBalances.find(b => b.asset === assetSymbol);
    if (!holding) return;

    setFetchingMexcAssetDetails(true);
    const toastId = toast.loading(`Importing ${assetSymbol} details from MEXC...`);
    try {
      const unitsVal = (parseFloat(holding.free) + parseFloat(holding.locked)).toString();
      setName(assetSymbol);
      setUnits(unitsVal);
      setType('Crypto');
      setSelectedCurrency('USD');

      // 1. Fetch live crypto price
      const price = await fetchCryptoPrice(assetSymbol);
      if (price) {
        setCurrentPrice(price.toString());
        setBuyPrice(price.toString());
      }

      // 2. Fetch current exchange rate for USD vs base currency as initial fallback
      await fetchExchangeRate('USD');

      // 3. Fetch past trades or orders to calculate weighted average buy price & historical exchange rate
      const key = await getConfig('mexc_api_key');
      const secret = await getConfig('mexc_api_secret');
      if (key && secret) {
        const { getMEXCTrades, getMEXCOrders } = await import('../db/queries');
        
        // Fetch executed trades first (highest accuracy)
        let tradesData = await getMEXCTrades(key, secret, assetSymbol);
        
        // Fallback to orders if trades failed or empty
        if (!Array.isArray(tradesData) || tradesData.length === 0) {
          tradesData = await getMEXCOrders(key, secret, assetSymbol);
        }

        if (Array.isArray(tradesData) && tradesData.length > 0) {
          const buyFills = tradesData.filter((t: any) => 
            t.isBuyer === true || 
            t.side === 'BUY' && (t.status === 'FILLED' || t.status === 'PARTIALLY_FILLED' || parseFloat(t.executedQty) > 0)
          );
          
          if (buyFills.length > 0) {
            let totalSpent = 0;
            let totalQty = 0;
            let lastTradeTime = 0;
            
            buyFills.forEach((t: any) => {
              const qty = parseFloat(t.qty || t.executedQty || 0);
              const priceVal = parseFloat(t.price || (t.type === 'MARKET' ? (parseFloat(t.cummulativeQuoteQty) / qty) : 0));
              const timeVal = t.time || t.timestamp || 0;
              
              if (qty > 0 && priceVal > 0) {
                totalSpent += (qty * priceVal);
                totalQty += qty;
                if (timeVal > lastTradeTime) {
                  lastTradeTime = timeVal;
                }
              }
            });
            
            if (totalQty > 0) {
              const avgBuyPrice = totalSpent / totalQty;
              setBuyPrice(avgBuyPrice.toFixed(6).replace(/\.?0+$/, ''));
              
              // Fetch historical exchange rate at the time of the latest buy trade
              if (lastTradeTime > 0) {
                const tradeDate = new Date(lastTradeTime).toISOString().split('T')[0];
                const histRate = await fetchHistoricalExchangeRate('USD', baseCurrency.code, tradeDate);
                if (histRate) {
                  setBuyExchangeRate(histRate.toString());
                  toast.success(`Imported ${assetSymbol} holding with weighted avg buy price: $${avgBuyPrice.toLocaleString()} and historical ex. rate (${tradeDate}): ${histRate.toFixed(2)}`, { id: toastId });
                  return;
                }
              }

              toast.success(`Imported ${assetSymbol} holding and weighted avg buy price: $${avgBuyPrice.toLocaleString()}!`, { id: toastId });
              return;
            }
          }
        }
      }
      
      toast.success(`Imported ${assetSymbol} holding with current price: $${price}!`, { id: toastId });
    } catch (error) {
      console.error('Failed to import MEXC asset details:', error);
      toast.error('Failed to calculate average buy price or historical exchange rate. Defaulted to current prices.', { id: toastId });
    } finally {
      setFetchingMexcAssetDetails(false);
    }
  };

  const handleRefreshPrices = async () => {
    setRefreshing(true);
    try {
      const updatedInvestments = [...investments];
      let updatedCount = 0;

      for (let i = 0; i < updatedInvestments.length; i++) {
        const inv = updatedInvestments[i];
        let newPrice = null;

        if (inv.type === 'Crypto') {
          newPrice = await fetchCryptoPrice(inv.name);
        } else if (inv.type === 'Gold') {
          newPrice = await fetchGoldPrice();
        }

        if (newPrice !== null) {
          await updateInvestment(inv.id, { current_price: newPrice });
          updatedInvestments[i] = { ...inv, current_price: newPrice };
          updatedCount++;
        }
      }

      if (updatedCount > 0) {
        setInvestments(updatedInvestments);
        calculateTotals(updatedInvestments);
        toast.success(`Updated ${updatedCount} asset prices`);
      } else {
        toast.info('No prices updated');
      }
    } catch (error) {
      toast.error('Failed to refresh prices');
    } finally {
      setRefreshing(false);
    }
  };

  const silentRefreshPrices = async () => {
    try {
      // 1. Get latest exchange rate for USD to baseCurrency
      let usdExRate = 1;
      if (baseCurrency.code !== 'USD') {
        try {
          const res = await fetch(`https://api.exchangerate-api.com/v4/latest/USD`);
          if (res.ok) {
            const data = await res.json();
            usdExRate = data.rates[baseCurrency.code] || 1;
          }
        } catch (e) {
          console.warn('[Silent Refresh] Failed to fetch USD exchange rate, using existing.', e);
        }
      }

      const invList = await getInvestments();
      const updatedInvestments = [...invList];
      let updatedCount = 0;

      for (let i = 0; i < updatedInvestments.length; i++) {
        const inv = updatedInvestments[i];
        let newPrice = null;

        if (inv.type === 'Crypto') {
          newPrice = await fetchCryptoPrice(inv.name);
        } else if (inv.type === 'Gold') {
          newPrice = await fetchGoldPrice();
        }

        if (newPrice !== null) {
          const updates: any = {};
          let hasUpdate = false;

          if (newPrice !== inv.current_price) {
            updates.current_price = newPrice;
            hasUpdate = true;
          }

          // If it's a USD asset, keep its exchange rate fresh and self-heal if it was 1!
          if (inv.currency === 'USD' && usdExRate > 1 && (inv.current_exchange_rate < 10 || Math.abs(usdExRate - inv.current_exchange_rate) > 0.01)) {
            updates.current_exchange_rate = usdExRate;
            hasUpdate = true;
          }

          if (hasUpdate) {
            await updateInvestmentInMemory(inv.id, updates);
            updatedInvestments[i] = { ...inv, ...updates };
            updatedCount++;
          }
        }
      }

      if (updatedCount > 0) {
        setInvestments(updatedInvestments);
        calculateTotals(updatedInvestments);
      }
    } catch (error) {
      console.warn('[Silent Refresh] Failed to auto-refresh asset prices:', error);
    }
  };

  const handleEdit = (inv: Investment) => {
    setEditingInvestment(inv);
    setName(inv.name);
    setType(inv.type);
    setUnits(inv.units.toString());
    setBuyPrice(inv.average_buy_price.toString());
    setCurrentPrice(inv.current_price.toString());
    setSelectedCurrency(inv.currency);
    setBuyExchangeRate(inv.buy_exchange_rate.toString());
    setCurrentExchangeRate(inv.current_exchange_rate.toString());
    setFundingAccountId(inv.funding_account_id || '');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !units || !buyPrice) {
      toast.error('Please fill all required fields');
      return;
    }

    try {
      if (type === 'Crypto') {
        if (editingInvestment) {
          toast.info('To manage Crypto, please modify transactions in the Ledger Records tab.');
          return;
        } else {
          await addAssetTransaction(
            name.toUpperCase().trim(),
            txnType,
            parseFloat(units),
            parseFloat(buyPrice),
            quoteAsset.toUpperCase().trim(),
            feeAsset ? feeAsset.toUpperCase().trim() : null,
            parseFloat(feeQty || '0'),
            'Manual'
          );
          toast.success('Double-Entry Ledger transaction recorded & WAC recalculated!');
        }
      } else {
        if (editingInvestment) {
          await updateInvestment(editingInvestment.id, {
            name,
            type,
            units: parseFloat(units),
            average_buy_price: parseFloat(buyPrice),
            current_price: parseFloat(currentPrice || buyPrice),
            currency: selectedCurrency,
            buy_exchange_rate: parseFloat(buyExchangeRate),
            current_exchange_rate: parseFloat(currentExchangeRate || buyExchangeRate)
          });
          toast.success('Asset updated successfully');
        } else {
          await addInvestment(
            name,
            type,
            parseFloat(units),
            parseFloat(buyPrice),
            parseFloat(currentPrice || buyPrice),
            selectedCurrency,
            parseFloat(buyExchangeRate),
            parseFloat(buyExchangeRate),
            fundingAccountId || null
          );
          toast.success('Asset added successfully');
        }
      }
      setIsModalOpen(false);
      resetForm();
      loadData();
    } catch (error) {
      toast.error('Failed to save investment changes');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this asset?')) return;
    try {
      await deleteInvestment(id);
      toast.success('Asset removed');
      loadData();
    } catch (error) {
      toast.error('Failed to remove asset');
    }
  };

  const handleDeleteTxn = async (id: string) => {
    if (!confirm('Are you sure you want to delete this ledger transaction? Running inventory & costs will be automatically recalculated.')) return;
    try {
      await deleteAssetTransaction(id);
      toast.success('Ledger transaction deleted & holdings recalculated!');
      loadData();
    } catch (error) {
      toast.error('Failed to delete transaction.');
    }
  };

  const resetForm = () => {
    setEditingInvestment(null);
    setName('');
    setType('Stock');
    setUnits('');
    setBuyPrice('');
    setCurrentPrice('');
    setSelectedCurrency(baseCurrency.code);
    setBuyExchangeRate('1');
    setCurrentExchangeRate('1');
    setFundingAccountId('');
  };

  const assetTypes = ['Gold', 'Stock', 'Crypto', 'Cash', 'Real Estate'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Investments</h1>
        <div className="flex gap-2">
          {activeSubTab === 'portfolio' && (
            <button
              onClick={handleRefreshPrices}
              disabled={refreshing}
              className={`bg-muted text-muted-foreground p-2 rounded-full hover:bg-muted/80 transition-colors ${refreshing ? 'animate-spin' : ''}`}
            >
              <RefreshCw size={24} />
            </button>
          )}
          <button
            onClick={() => {
              resetForm();
              setIsModalOpen(true);
            }}
            className="bg-primary text-primary-foreground p-2 rounded-full hover:opacity-90 transition-opacity"
          >
            <Plus size={24} />
          </button>
        </div>
      </div>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
          <p className="text-sm text-muted-foreground mb-1 font-medium">Total Portfolio Value</p>
          <h2 className="text-3xl font-black tracking-tight">{formatAmount(totalValue)}</h2>
        </div>
        <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
          <p className="text-sm text-muted-foreground mb-1 font-medium">Total Profit/Loss</p>
          <div className="flex items-center gap-2">
            <h2 className={`text-3xl font-black tracking-tight ${profitLoss.profit_loss >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
              {profitLoss.profit_loss >= 0 ? '+' : ''}{formatAmount(profitLoss.profit_loss)}
            </h2>
            <span className={`text-sm font-bold px-3 py-1 rounded-full ${profitLoss.profit_loss >= 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-destructive/10 text-destructive'}`}>
              {profitLoss.profit_loss >= 0 ? '+' : ''}{profitLoss.profit_loss_pct.toFixed(2)}%
            </span>
          </div>
        </div>
      </div>

      {/* Sub Tabs Navigation */}
      <div className="flex bg-muted/30 p-1.5 rounded-[1.5rem] border border-border/80">
        <button
          onClick={() => setActiveSubTab('portfolio')}
          className={`flex-1 py-3.5 px-4 rounded-[1.2rem] text-xs font-black uppercase tracking-widest transition-all ${activeSubTab === 'portfolio' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <div className="flex items-center justify-center gap-2">
            <Coins size={16} />
            Holdings Portfolio
          </div>
        </button>
        <button
          onClick={() => setActiveSubTab('transactions')}
          className={`flex-1 py-3.5 px-4 rounded-[1.2rem] text-xs font-black uppercase tracking-widest transition-all ${activeSubTab === 'transactions' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <div className="flex items-center justify-center gap-2">
            <History size={16} />
            Ledger Records ({assetTransactions.length})
          </div>
        </button>
        <button
          onClick={() => setActiveSubTab('ledger')}
          className={`flex-1 py-3.5 px-4 rounded-[1.2rem] text-xs font-black uppercase tracking-widest transition-all ${activeSubTab === 'ledger' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <div className="flex items-center justify-center gap-2">
            <BookOpen size={16} />
            Double-Entry Ledger Book
          </div>
        </button>
      </div>

      {/* Tab 1: Holdings Portfolio */}
      {activeSubTab === 'portfolio' && (
        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="font-bold text-lg flex items-center gap-2 px-1">
              <Coins size={20} className="text-primary" />
              Your Assets
            </h3>
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map(i => <div key={i} className="h-40 bg-muted animate-pulse rounded-2xl" />)}
              </div>
            ) : investments.length === 0 ? (
              <div className="bg-card p-12 rounded-2xl border border-dashed border-border text-center">
                <div className="bg-muted w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <BarChart3 size={32} className="text-muted-foreground opacity-50" />
                </div>
                <p className="text-muted-foreground font-medium">No investments tracked yet</p>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="mt-4 text-primary font-bold hover:underline bg-primary/5 px-4 py-2 rounded-lg"
                >
                  Add your first asset
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {investments.map((inv) => {
                  const currentExRate = inv.current_exchange_rate || 1;
                  const currentVal = inv.units * inv.current_price * currentExRate;
                  const costVal = inv.units * inv.average_buy_price * inv.buy_exchange_rate;
                  const pl = currentVal - costVal;
                  const plPct = costVal > 0 ? (pl / costVal) * 100 : 0;

                  return (
                    <div key={inv.id} className="bg-card p-5 rounded-2xl border border-border group hover:border-primary/50 transition-all shadow-sm hover:shadow-md relative overflow-hidden">
                      <div className={`absolute top-0 left-0 w-1 h-full ${pl >= 0 ? 'bg-emerald-500' : 'bg-destructive'}`} />
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                              {inv.type}
                            </span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-primary bg-primary/10 px-2 py-0.5 rounded-md">
                              {inv.currency}
                            </span>
                          </div>
                          <h4 className="font-black text-xl leading-tight">{inv.name}</h4>
                          <p className="text-xs text-muted-foreground mt-1 font-semibold">
                            {inv.units.toLocaleString(undefined, { maximumFractionDigits: 6 })} units
                          </p>
                          {inv.type === 'Crypto' ? (
                            <p className="text-[11px] text-primary/80 font-black mt-1">
                              WAC Cost: PKR {(inv.average_buy_price * inv.buy_exchange_rate).toLocaleString(undefined, { maximumFractionDigits: 2 })} / unit
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Cost: {inv.currency} {inv.average_buy_price.toLocaleString()}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1">
                          {inv.type !== 'Crypto' && (
                            <button
                              onClick={() => handleEdit(inv)}
                              className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-primary transition-all p-1"
                            >
                              <Edit3 size={18} />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(inv.id)}
                            className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-all p-1"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>

                      <div className="flex items-end justify-between mt-6">
                        <div>
                          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-0.5">Current Value</p>
                          <p className="text-2xl font-black">{formatAmount(currentVal)}</p>
                        </div>
                        <div className={`text-right ${pl >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                          <div className="flex items-center justify-end gap-1 text-sm font-black">
                            {pl >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                            {pl >= 0 ? '+' : ''}{plPct.toFixed(1)}%
                          </div>
                          <p className="text-xs font-bold opacity-80 leading-none">{pl >= 0 ? '+' : ''}{formatAmount(pl)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* MEXC Wallet Section */}
          {mexcApiKey && (
            <div className="space-y-4 pt-4 border-t border-border/50">
              <div className="flex items-center justify-between px-1">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <Wallet size={20} className="text-primary" />
                  MEXC Exchange Wallet
                </h3>
                <button
                  onClick={handleSyncMexcTrades}
                  disabled={syncingMexcTrades || loadingMexc}
                  className="bg-primary/10 text-primary hover:bg-primary/20 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 active:scale-95"
                >
                  <RefreshCw size={14} className={syncingMexcTrades ? 'animate-spin' : ''} />
                  Sync MEXC Trade History
                </button>
              </div>
              {loadingMexc ? (
                <div className="bg-card p-8 rounded-2xl border border-border flex items-center justify-center">
                  <RefreshCw size={24} className="animate-spin text-muted-foreground" />
                </div>
              ) : mexcBalances.length === 0 ? (
                <div className="bg-card p-8 rounded-2xl border border-border text-center text-muted-foreground">
                  No active balances found on MEXC
                </div>
              ) : (
                <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
                  <table className="w-full text-left">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr>
                        <th className="p-4 text-xs font-black uppercase tracking-widest text-muted-foreground">Asset</th>
                        <th className="p-4 text-xs font-black uppercase tracking-widest text-muted-foreground text-right">Free</th>
                        <th className="p-4 text-xs font-black uppercase tracking-widest text-muted-foreground text-right">Locked</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {mexcBalances.map((b, i) => (
                        <tr key={i} className="hover:bg-muted/30 transition-colors">
                          <td className="p-4 font-black">{b.asset}</td>
                          <td className="p-4 text-right font-mono text-sm">{parseFloat(b.free).toFixed(4)}</td>
                          <td className="p-4 text-right font-mono text-sm text-muted-foreground">{parseFloat(b.locked).toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Ledger Records */}
      {activeSubTab === 'transactions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <History size={20} className="text-primary" />
              Double-Entry Transaction Ledger
            </h3>
            <button
              onClick={() => {
                resetForm();
                setType('Crypto');
                setTxnType('BUY');
                setQuoteAsset('USDT');
                setIsModalOpen(true);
              }}
              className="bg-primary text-primary-foreground hover:opacity-90 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 active:scale-95 shadow-lg shadow-primary/20"
            >
              <PlusCircle size={14} />
              Add Transaction
            </button>
          </div>

          {assetTransactions.length === 0 ? (
            <div className="bg-card p-12 rounded-2xl border border-dashed border-border text-center">
              <p className="text-muted-foreground font-medium mb-2">No transaction records found</p>
              <p className="text-xs text-muted-foreground/80 max-w-md mx-auto mb-4">
                Add manual trades or sync your MEXC API to generate chronological ledger records and automatically compute weighted average costs.
              </p>
            </div>
          ) : (
            <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm overflow-x-auto">
              <table className="w-full text-left min-w-[700px]">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="p-4 text-xs font-black uppercase tracking-widest text-muted-foreground">Date</th>
                    <th className="p-4 text-xs font-black uppercase tracking-widest text-muted-foreground">Type</th>
                    <th className="p-4 text-xs font-black uppercase tracking-widest text-muted-foreground">Pair</th>
                    <th className="p-4 text-xs font-black uppercase tracking-widest text-muted-foreground text-right">Quantity</th>
                    <th className="p-4 text-xs font-black uppercase tracking-widest text-muted-foreground text-right">Unit Price</th>
                    <th className="p-4 text-xs font-black uppercase tracking-widest text-muted-foreground text-right">Total Cost</th>
                    <th className="p-4 text-xs font-black uppercase tracking-widest text-muted-foreground">Fee</th>
                    <th className="p-4 text-xs font-black uppercase tracking-widest text-muted-foreground">Source</th>
                    <th className="p-4 text-xs font-black uppercase tracking-widest text-muted-foreground text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {assetTransactions.map((tx) => {
                    const isBuy = tx.txn_type === 'BUY' || tx.txn_type === 'DEPOSIT';
                    
                    return (
                      <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-4 text-xs font-semibold text-muted-foreground">
                          {new Date(tx.timestamp).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td className="p-4">
                          <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            tx.txn_type === 'BUY' ? 'bg-emerald-500/10 text-emerald-500' :
                            tx.txn_type === 'SELL' ? 'bg-destructive/10 text-destructive' :
                            tx.txn_type === 'DEPOSIT' ? 'bg-blue-500/10 text-blue-500' : 'bg-muted text-muted-foreground'
                          }`}>
                            {tx.txn_type}
                          </span>
                        </td>
                        <td className="p-4 font-black text-sm">
                          {tx.asset_symbol} / {tx.quote_asset}
                        </td>
                        <td className={`p-4 text-right font-mono text-sm font-black ${isBuy ? 'text-emerald-500' : 'text-destructive'}`}>
                          {isBuy ? '+' : '-'}{tx.qty.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                        </td>
                        <td className="p-4 text-right font-mono text-sm font-semibold">
                          {tx.unit_price.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                        </td>
                        <td className="p-4 text-right font-mono text-sm font-black text-foreground">
                          {(tx.qty * tx.unit_price).toLocaleString(undefined, { maximumFractionDigits: 2 })} {tx.quote_asset}
                        </td>
                        <td className="p-4 text-xs text-muted-foreground font-semibold">
                          {tx.fee_qty > 0 ? `${tx.fee_qty} ${tx.fee_asset || ''}` : '-'}
                        </td>
                        <td className="p-4 text-xs font-semibold text-muted-foreground">
                          {tx.source}
                        </td>
                        <td className="p-4 text-center">
                          <button
                            onClick={() => handleDeleteTxn(tx.id)}
                            className="text-muted-foreground hover:text-destructive p-1 rounded-full hover:bg-destructive/5 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Double-Entry Ledger Book */}
      {activeSubTab === 'ledger' && (
        <div className="space-y-4">
          <div className="px-1">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <BookOpen size={20} className="text-primary" />
              Rolling Inventory Cost Ledger
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
              This ledger replays all transaction logs chronologically. When crypto is traded for other assets, WAC and PKR valuation propagate through double-entry bookings without relying on isolated current market rates.
            </p>
          </div>

          {inventoryLedger.length === 0 ? (
            <div className="bg-card p-12 rounded-2xl border border-dashed border-border text-center">
              <p className="text-muted-foreground font-medium">Ledger book is currently empty</p>
              <p className="text-xs text-muted-foreground/80 mt-1">
                Record buy/sell transactions to see double-entry cost propagation step-by-step.
              </p>
            </div>
          ) : (
            <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm overflow-x-auto">
              <table className="w-full text-left min-w-[800px]">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="p-4 text-xs font-black uppercase tracking-widest text-muted-foreground">Timestamp</th>
                    <th className="p-4 text-xs font-black uppercase tracking-widest text-muted-foreground">Asset</th>
                    <th className="p-4 text-xs font-black uppercase tracking-widest text-muted-foreground text-right">Qty Change</th>
                    <th className="p-4 text-xs font-black uppercase tracking-widest text-muted-foreground text-right">PKR Value Change</th>
                    <th className="p-4 text-xs font-black uppercase tracking-widest text-muted-foreground text-right">Running Qty</th>
                    <th className="p-4 text-xs font-black uppercase tracking-widest text-muted-foreground text-right">Running PKR Value</th>
                    <th className="p-4 text-xs font-black uppercase tracking-widest text-muted-foreground text-right">Rolling WAC (PKR/Unit)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {inventoryLedger.map((lg) => {
                    const isPositive = lg.qty_change > 0;
                    
                    return (
                      <tr key={lg.id} className="hover:bg-muted/30 transition-colors font-semibold">
                        <td className="p-4 text-xs text-muted-foreground">
                          {new Date(lg.timestamp).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td className="p-4 text-sm font-black text-foreground">
                          {lg.asset_symbol}
                        </td>
                        <td className={`p-4 text-right font-mono text-sm ${isPositive ? 'text-emerald-500' : 'text-destructive'}`}>
                          {isPositive ? '+' : ''}{lg.qty_change.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                        </td>
                        <td className={`p-4 text-right font-mono text-sm ${isPositive ? 'text-emerald-500' : 'text-destructive'}`}>
                          {isPositive ? '+' : ''}PKR {lg.pkr_value_change.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </td>
                        <td className="p-4 text-right font-mono text-sm text-foreground">
                          {lg.running_qty.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                        </td>
                        <td className="p-4 text-right font-mono text-sm text-foreground">
                          PKR {lg.running_pkr_value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </td>
                        <td className="p-4 text-right font-mono text-sm text-primary font-black">
                          PKR {lg.avg_cost.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Asset Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
          <div className="bg-card border border-border w-full max-w-xl rounded-[2.5rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.3)] overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="p-8 border-b border-border flex items-center justify-between bg-muted/30">
              <h2 className="text-2xl font-black tracking-tight">
                {editingInvestment ? 'Edit Asset' : (type === 'Crypto' ? 'Add Crypto Transaction' : 'Add New Asset')}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="bg-background text-muted-foreground hover:text-foreground p-2 rounded-full transition-colors shadow-sm">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              {!editingInvestment && type === 'Crypto' && mexcBalances.length > 0 && (
                <div className="bg-primary/5 border border-primary/20 rounded-[1.5rem] p-5 space-y-3 animate-in slide-in-from-top duration-300">
                  <div className="flex items-center justify-between">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-primary">Quick Import MEXC Asset</label>
                    <span className="text-[9px] bg-primary/10 text-primary font-black uppercase tracking-widest px-2 py-0.5 rounded-full">Live Balance</span>
                  </div>
                  <select
                    onChange={(e) => handleImportMexcAsset(e.target.value)}
                    defaultValue=""
                    disabled={fetchingMexcAssetDetails}
                    className="w-full bg-card border border-border rounded-xl px-4 py-3 text-xs font-black outline-none focus:ring-2 focus:ring-primary appearance-none"
                  >
                    <option value="" disabled>-- Select Exchange Holding --</option>
                    {mexcBalances.map((b) => (
                      <option key={b.asset} value={b.asset}>
                        {b.asset} (Hold: {(parseFloat(b.free) + parseFloat(b.locked)).toLocaleString(undefined, { maximumFractionDigits: 6 })})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">Asset Symbol</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. SOL, BTC, Gold"
                      className="w-full bg-muted/50 border-2 border-transparent rounded-2xl p-4 focus:border-primary focus:bg-background outline-none transition-all font-bold"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">Asset Type</label>
                    <div className="grid grid-cols-2 gap-2">
                      {assetTypes.map(t => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setType(t)}
                          className={`py-3 px-2 rounded-xl text-xs font-black uppercase tracking-widest border-2 transition-all ${type === t ? 'border-primary bg-primary text-primary-foreground' : 'border-transparent bg-muted/50 text-muted-foreground hover:bg-muted'
                            }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {type === 'Crypto' ? (
                    <>
                      <div>
                        <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">Transaction Type</label>
                        <select
                          value={txnType}
                          onChange={(e) => setTxnType(e.target.value as any)}
                          className="w-full bg-muted/50 border-2 border-transparent rounded-2xl p-4 focus:border-primary focus:bg-background outline-none transition-all font-bold"
                        >
                          <option value="BUY">BUY (Trade crypto / asset)</option>
                          <option value="SELL">SELL (Liquidate / trade asset)</option>
                          <option value="DEPOSIT">DEPOSIT (Fiat P2P / manual funding)</option>
                          <option value="WITHDRAWAL">WITHDRAWAL (Send out / transfer)</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">Quote Currency</label>
                          <select
                            value={quoteAsset}
                            onChange={(e) => setQuoteAsset(e.target.value)}
                            className="w-full bg-muted/50 border-2 border-transparent rounded-2xl p-4 focus:border-primary focus:bg-background outline-none transition-all font-bold"
                          >
                            <option value="USDT">USDT (Tether)</option>
                            <option value="PKR">PKR (Pak Rupee)</option>
                            <option value="USD">USD (US Dollar)</option>
                            <option value="BTC">BTC (Bitcoin)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">Ex. Rate (vs PKR)</label>
                          <input
                            type="number"
                            step="any"
                            value={buyExchangeRate}
                            onChange={(e) => setBuyExchangeRate(e.target.value)}
                            placeholder="Dynamic"
                            className="w-full bg-muted/50 border-2 border-transparent rounded-2xl p-4 focus:border-primary focus:bg-background outline-none transition-all font-bold text-muted-foreground"
                            readOnly
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">Currency</label>
                          <select
                            value={selectedCurrency}
                            onChange={(e) => setSelectedCurrency(e.target.value)}
                            className="w-full bg-muted/50 border-2 border-transparent rounded-2xl p-4 focus:border-primary focus:bg-background outline-none transition-all font-bold appearance-none"
                          >
                            {currencies.map(c => (
                              <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">Ex. Rate (vs {baseCurrency.code})</label>
                          <input
                            type="number"
                            step="any"
                            value={buyExchangeRate}
                            onChange={(e) => setBuyExchangeRate(e.target.value)}
                            placeholder="1.00"
                            className="w-full bg-muted/50 border-2 border-transparent rounded-2xl p-4 focus:border-primary focus:bg-background outline-none transition-all font-bold"
                          />
                        </div>
                      </div>

                      {!editingInvestment && (
                        <div>
                          <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">Funding Account (Optional)</label>
                          <div className="relative">
                            <select
                              value={fundingAccountId}
                              onChange={(e) => setFundingAccountId(e.target.value)}
                              className="w-full bg-muted/50 border-2 border-transparent rounded-2xl p-4 pl-12 focus:border-primary focus:bg-background outline-none transition-all font-bold appearance-none"
                            >
                              <option value="">No Account (Tracking only)</option>
                              {accounts.map(acc => (
                                <option key={acc.id} value={acc.id}>{acc.name}</option>
                              ))}
                            </select>
                            <Wallet className="absolute left-4 top-4 text-muted-foreground" size={20} />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {type === 'Crypto' && (
                <div className="grid grid-cols-2 gap-4 bg-muted/20 border border-border p-4 rounded-2xl">
                  <div>
                    <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-1">Fee Asset (Optional)</label>
                    <input
                      type="text"
                      value={feeAsset}
                      onChange={(e) => setFeeAsset(e.target.value)}
                      placeholder="e.g. USDT, BNB"
                      className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-xs font-bold outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-1">Fee Qty</label>
                    <input
                      type="number"
                      step="any"
                      value={feeQty}
                      onChange={(e) => setFeeQty(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-xs font-bold outline-none font-mono"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">Quantity</label>
                  <input
                    type="number"
                    step="any"
                    value={units}
                    onChange={(e) => setUnits(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-muted/50 border-2 border-transparent rounded-2xl p-4 focus:border-primary focus:bg-background outline-none transition-all font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">
                    Unit Buy Price
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={buyPrice}
                    onChange={(e) => setBuyPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-muted/50 border-2 border-transparent rounded-2xl p-4 focus:border-primary focus:bg-background outline-none transition-all font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">Current Price</label>
                  <input
                    type="number"
                    step="any"
                    value={currentPrice}
                    onChange={(e) => setCurrentPrice(e.target.value)}
                    placeholder="Optional"
                    className="w-full bg-muted/50 border-2 border-transparent rounded-2xl p-4 focus:border-primary focus:bg-background outline-none transition-all font-bold"
                    disabled={type === 'Crypto'}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-primary text-primary-foreground py-5 rounded-[2rem] font-black text-lg mt-4 hover:opacity-90 transition-all flex items-center justify-center gap-3 shadow-xl shadow-primary/20 active:scale-[0.98]"
              >
                {type === 'Crypto' ? <PlusCircle size={24} /> : (editingInvestment ? <Edit3 size={24} /> : <PlusCircle size={24} />)}
                {type === 'Crypto' ? 'Record Ledger Transaction' : (editingInvestment ? 'Update Investment' : 'Track Investment Asset')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Investments;
