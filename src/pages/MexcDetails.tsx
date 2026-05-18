import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, RefreshCw, Wallet, TrendingUp, TrendingDown,
  Activity, Repeat, Calendar, Search, ChevronDown
} from 'lucide-react';
import {
  getConfig, getMEXCData, getMEXCOrders, fetchCryptoPrice,
  getMEXCDeposits, getMEXCWithdrawals, getMEXCTransfers
} from '../db/queries';
import { useCurrency } from '../contexts/CurrencyContext';
import { toast } from 'sonner';

const MexcDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { formatAmount } = useCurrency();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'holdings' | 'trades' | 'history'>('holdings');
  const [historySubTab, setHistorySubTab] = useState<'deposit' | 'withdrawal' | 'transfer' | 'send' | 'others'>('transfer');

  // Dynamic Filters
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Default 30 days
    end: new Date().toISOString().split('T')[0]
  });
  const [accountType, setAccountType] = useState('Spot Account');
  const [showAccountMenu, setShowAccountMenu] = useState(false);

  const [balances, setBalances] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [deposits, setDeposits] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [totalUSD, setTotalUSD] = useState(0);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const key = await getConfig('mexc_api_key');
      const secret = await getConfig('mexc_api_secret');

      if (!key || !secret) {
        toast.error('MEXC API keys missing');
        navigate('/accounts');
        return;
      }

      // Fetch with current filters
      const now = Date.now();
      const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000 - 60000; // Strictly under 7 days
      const ninetyDaysInMs = 89 * 24 * 60 * 60 * 1000; // Strictly under 90 days
      
      let endTimestamp = Math.min(new Date(dateRange.end).getTime() + 86400000, now);
      let userStartTimestamp = new Date(dateRange.start).getTime();

      // Transfer window (90 days)
      const transferStart = Math.max(userStartTimestamp, endTimestamp - ninetyDaysInMs);
      
      // Deposit/Withdrawal window (7 days - MEXC restriction)
      const depositWithdrawStart = Math.max(userStartTimestamp, endTimestamp - sevenDaysInMs);

      const [balanceData, depositData, withdrawData, transferData] = await Promise.all([
        getMEXCData(key, secret),
        getMEXCDeposits(key, secret, depositWithdrawStart, endTimestamp),
        getMEXCWithdrawals(key, secret, depositWithdrawStart, endTimestamp),
        getMEXCTransfers(key, secret, transferStart, endTimestamp)
      ]);

      // Check for MEXC specific errors in responses
      const checkError = (data: any) => data && data.code === 33333;
      if (checkError(depositData) || checkError(withdrawData) || checkError(transferData)) {
        toast.error('MEXC: Selected date range is too wide (max 90 days)');
      }

      // Normalize
      const normDeposits = Array.isArray(depositData) ? depositData : (depositData.rows || depositData.data || []);
      const normWithdrawals = Array.isArray(withdrawData) ? withdrawData : (withdrawData.rows || withdrawData.data || []);
      const normTransfers = Array.isArray(transferData) ? transferData : (transferData.rows || transferData.data || []);

      // Client-side filtering for better responsiveness
      const filteredDeposits = normDeposits.filter((d: any) => {
        const time = d.insertTime || d.time;
        return time >= userStartTimestamp && time <= endTimestamp;
      });

      const filteredWithdrawals = normWithdrawals.filter((w: any) => {
        const time = w.applyTime || w.time;
        return time >= userStartTimestamp && time <= endTimestamp;
      });

      const filteredTransfers = normTransfers.filter((t: any) => {
        const time = t.timestamp || t.time;
        const inRange = time >= userStartTimestamp && time <= endTimestamp;
        if (!inRange) return false;

        if (accountType === 'Fiat Account') return t.remark?.toLowerCase().includes('fiat') || t.type?.toLowerCase().includes('fiat');
        if (accountType === 'Spot Account') return !t.remark?.toLowerCase().includes('fiat') && !t.type?.toLowerCase().includes('fiat');
        return true;
      });

      setDeposits(filteredDeposits);
      setWithdrawals(filteredWithdrawals);
      setTransfers(filteredTransfers);

      if (balanceData && balanceData.balances) {
        const activeBalances = balanceData.balances.filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
        const priceMap: Record<string, number> = {};
        let total = 0;

        for (const b of activeBalances) {
          if (b.asset === 'USDT' || b.asset === 'USD') {
            priceMap[b.asset] = 1;
            total += (parseFloat(b.free) + parseFloat(b.locked));
          } else {
            const p = await fetchCryptoPrice(b.asset);
            if (p) {
              priceMap[b.asset] = p;
              total += (parseFloat(b.free) + parseFloat(b.locked)) * p;
            }
          }
        }

        setBalances(activeBalances.sort((a: any, b: any) => {
          const valA = (parseFloat(a.free) + parseFloat(a.locked)) * (priceMap[a.asset] || 0);
          const valB = (parseFloat(b.free) + parseFloat(b.locked)) * (priceMap[b.asset] || 0);
          return valB - valA;
        }));
        setPrices(priceMap);
        setTotalUSD(total);

        const topSymbols = activeBalances.slice(0, 3).filter((b: any) => b.asset !== 'USDT').map((b: any) => b.asset);
        const orderPromises = topSymbols.map((sym: any) => getMEXCOrders(key, secret, sym));
        const orderResults = await Promise.all(orderPromises);
        setOrders(orderResults.flat().filter((o: any) => o && !o.error).sort((a: any, b: any) => b.time - a.time));
      }
    } catch (error) {
      console.error('MEXC Load Error:', error);
      toast.error('Sync failed');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, dateRange, accountType]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDateChange = (type: 'start' | 'end', val: string) => {
    setDateRange(prev => ({ ...prev, [type]: val }));
  };

  const formatCrypto = (val: number) => {
    return formatAmount(val, '$', 2);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] space-y-6">
        <RefreshCw size={48} className="animate-spin text-primary opacity-20" />
        <p className="font-black text-xs uppercase tracking-widest text-muted-foreground">Synchronizing Records...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/accounts')} className="p-3 hover:bg-muted rounded-2xl transition-all border border-border/50 bg-card active:scale-95">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-black tracking-tight">MEXC Global</h1>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              Real-time API
            </p>
          </div>
        </div>
        <button
          onClick={() => loadData(true)}
          disabled={refreshing}
          className={`p-4 bg-primary text-primary-foreground rounded-2xl shadow-xl shadow-primary/20 transition-all active:scale-90 ${refreshing ? 'animate-spin' : ''}`}
        >
          <RefreshCw size={20} />
        </button>
      </div>

      <div className="flex gap-1 bg-muted/30 p-1.5 rounded-2xl w-fit">
        {[
          { id: 'holdings', label: 'Holdings', icon: Wallet },
          { id: 'trades', label: 'Trade History', icon: Activity },
          { id: 'history', label: 'Transfers', icon: Repeat },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-card shadow-md text-foreground' : 'text-muted-foreground hover:bg-muted/50'
              }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="animate-in slide-in-from-bottom-4 duration-700">
        {activeTab === 'holdings' && (
          <div className="space-y-6">
            <div className="bg-foreground text-background p-10 rounded-[3rem] shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-80 h-80 bg-primary/20 rounded-full -mr-32 -mt-32 blur-[100px]" />
              <div className="relative">
                <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2">Total Estimated Balance</p>
                <div className="flex items-baseline gap-2">
                  <h2 className="text-6xl font-black tracking-tighter">{formatCrypto(totalUSD)}</h2>
                  <span className="text-xs font-black opacity-60">USDT</span>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-[2.5rem] border border-border shadow-sm overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="p-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Asset</th>
                    <th className="p-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right">Balance</th>
                    <th className="p-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right">Value (USDT)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {balances.map((b, i) => {
                    const amount = parseFloat(b.free) + parseFloat(b.locked);
                    const val = amount * (prices[b.asset] || 0);
                    return (
                      <tr key={i} className="group hover:bg-muted/10 transition-colors">
                        <td className="p-6">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center font-black text-xs">
                              {b.asset}
                            </div>
                            <div className="font-black text-base leading-none">{b.asset}</div>
                          </div>
                        </td>
                        <td className="p-6 text-right font-black text-sm">{amount.toLocaleString(undefined, { maximumFractionDigits: 6 })}</td>
                        <td className="p-6 text-right font-black text-lg">{formatCrypto(val)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'trades' && (
          <div className="bg-card rounded-[2.5rem] border border-border shadow-sm overflow-hidden">
            <div className="divide-y divide-border">
              {orders.map((order: any, i) => {
                const qty = parseFloat(order.executedQty) || parseFloat(order.origQty);
                const price = order.type === 'MARKET' ? (parseFloat(order.cummulativeQuoteQty) / (qty || 1)) : parseFloat(order.price);
                const total = order.type === 'MARKET' ? parseFloat(order.cummulativeQuoteQty) : price * qty;
                return (
                  <div key={i} className="p-6 hover:bg-muted/10 transition-colors flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-2xl ${order.side === 'BUY' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-destructive/10 text-destructive'}`}>
                        {order.side === 'BUY' ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                      </div>
                      <div>
                        <div className="font-black text-base leading-none mb-1">{order.symbol}</div>
                        <div className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">
                          {new Date(order.time).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-base">{qty.toFixed(4)} {order.symbol.replace('USDT', '')}</div>
                      <div className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mt-1">
                        {formatCrypto(total)} @ ${price.toLocaleString()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-6">
            <div className="flex border-b border-border overflow-x-auto no-scrollbar">
              {['deposit', 'withdrawal', 'transfer', 'send', 'others'].map(sub => (
                <button
                  key={sub}
                  onClick={() => setHistorySubTab(sub as any)}
                  className={`px-6 py-4 text-xs font-black uppercase tracking-widest transition-all relative whitespace-nowrap ${historySubTab === sub ? 'text-primary' : 'text-muted-foreground'
                    }`}
                >
                  {sub}
                  {historySubTab === sub && <div className="absolute bottom-0 left-6 right-6 h-1 bg-primary rounded-t-full" />}
                </button>
              ))}
            </div>

            <div className="bg-card p-6 rounded-[2.5rem] border border-border grid grid-cols-1 md:grid-cols-4 gap-6 items-end relative">
              <div className="space-y-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground ml-1">Start Date</p>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                  <input
                    type="date"
                    value={dateRange.start}
                    onChange={(e) => handleDateChange('start', e.target.value)}
                    className="w-full bg-muted/50 border border-border rounded-xl px-10 py-2.5 text-[11px] font-bold focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground ml-1">End Date</p>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                  <input
                    type="date"
                    value={dateRange.end}
                    onChange={(e) => handleDateChange('end', e.target.value)}
                    className="w-full bg-muted/50 border border-border rounded-xl px-10 py-2.5 text-[11px] font-bold focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
              </div>
              <div className="space-y-2 relative">
                <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground ml-1">Account</p>
                <button
                  onClick={() => setShowAccountMenu(!showAccountMenu)}
                  className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-[11px] font-bold flex justify-between items-center group"
                >
                  {accountType}
                  <ChevronDown size={14} className={`transition-transform duration-300 ${showAccountMenu ? 'rotate-180' : ''}`} />
                </button>
                {showAccountMenu && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-xl shadow-xl z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                    {['Spot Account', 'Fiat Account', 'Futures Account'].map(acc => (
                      <button
                        key={acc}
                        onClick={() => {
                          setAccountType(acc);
                          setShowAccountMenu(false);
                        }}
                        className="w-full px-4 py-3 text-[11px] font-bold text-left hover:bg-muted transition-colors border-b border-border last:border-0"
                      >
                        {acc}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  setAccountType('Spot Account');
                  setDateRange({
                    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    end: new Date().toISOString().split('T')[0]
                  });
                }}
                className="bg-muted hover:bg-muted/80 px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all active:scale-95"
              >
                Reset
              </button>
            </div>

            <div className="bg-card rounded-[2.5rem] border border-border shadow-sm overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-muted/30 border-b border-border">
                  <tr>
                    <th className="p-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Crypto</th>
                    <th className="p-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Time</th>
                    <th className="p-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Type</th>
                    <th className="p-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {historySubTab === 'transfer' && transfers.length > 0 ? (
                    transfers.map((t: any, i: number) => (
                      <tr key={i} className="hover:bg-muted/10 transition-colors">
                        <td className="p-5 font-black text-sm">{t.asset}</td>
                        <td className="p-5 text-[11px] font-bold text-muted-foreground">{new Date(t.timestamp || t.time).toLocaleString()}</td>
                        <td className="p-5">
                          <span className={`text-[10px] font-black uppercase tracking-widest ${t.type?.includes('IN') || t.amount > 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                            {t.remark || t.type?.replace(/_/g, ' ') || 'Internal Transfer'}
                          </span>
                        </td>
                        <td className="p-5 text-right font-black text-sm">
                          {parseFloat(t.amount).toLocaleString(undefined, { minimumFractionDigits: 4 })} {t.asset}
                        </td>
                      </tr>
                    ))
                  ) : historySubTab === 'deposit' && deposits.length > 0 ? (
                    deposits.map((d: any, i: number) => (
                      <tr key={i} className="hover:bg-muted/10 transition-colors">
                        <td className="p-5 font-black text-sm">{d.coin}</td>
                        <td className="p-5 text-[11px] font-bold text-muted-foreground">{new Date(d.insertTime).toLocaleString()}</td>
                        <td className="p-5 text-emerald-500 text-[10px] font-black uppercase tracking-widest">On-Chain Deposit</td>
                        <td className="p-5 text-right font-black text-sm">
                          {parseFloat(d.amount).toFixed(4)} {d.coin}
                        </td>
                      </tr>
                    ))
                  ) : historySubTab === 'withdrawal' && withdrawals.length > 0 ? (
                    withdrawals.map((w: any, i: number) => (
                      <tr key={i} className="hover:bg-muted/10 transition-colors">
                        <td className="p-5 font-black text-sm">{w.coin}</td>
                        <td className="p-5 text-[11px] font-bold text-muted-foreground">{new Date(w.applyTime).toLocaleString()}</td>
                        <td className="p-5 text-destructive text-[10px] font-black uppercase tracking-widest">On-Chain Withdrawal</td>
                        <td className="p-5 text-right font-black text-sm">
                          {parseFloat(w.amount).toFixed(4)} {w.coin}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="p-24 text-center text-muted-foreground opacity-30">
                        <Search size={48} className="mx-auto mb-4" />
                        <p className="font-black text-xs uppercase tracking-tighter">No records match your filters</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MexcDetails;
