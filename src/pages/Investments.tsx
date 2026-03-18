import React, { useState, useEffect } from 'react';
import {
  Plus,
  TrendingUp,
  TrendingDown,
  Coins,
  BarChart3,
  Trash2,
  PlusCircle,
  X
} from 'lucide-react';
import {
  getInvestments,
  addInvestment,
  deleteInvestment,
  calculatePortfolioValue,
  getInvestmentProfitLoss,
  type Investment
} from '../db/queries';
import { useCurrency } from '../contexts/CurrencyContext';
import { toast } from 'sonner';

const Investments: React.FC = () => {
  const { formatAmount } = useCurrency();
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [totalValue, setTotalValue] = useState(0);
  const [profitLoss, setProfitLoss] = useState({ profit_loss: 0, profit_loss_pct: 0 });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form State
  const [name, setName] = useState('');
  const [type, setType] = useState('Stock');
  const [units, setUnits] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [invList, value, pl] = await Promise.all([
        getInvestments(),
        calculatePortfolioValue(),
        getInvestmentProfitLoss()
      ]);
      setInvestments(invList);
      setTotalValue(value);
      setProfitLoss(pl);
    } catch (error) {
      toast.error('Failed to load investments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !units || !buyPrice) {
      toast.error('Please fill all required fields');
      return;
    }

    try {
      await addInvestment(
        name,
        type,
        parseFloat(units),
        parseFloat(buyPrice),
        parseFloat(currentPrice || buyPrice)
      );
      toast.success('Asset added successfully');
      setIsModalOpen(false);
      resetForm();
      loadData();
    } catch (error) {
      toast.error('Failed to add asset');
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

  const resetForm = () => {
    setName('');
    setType('Stock');
    setUnits('');
    setBuyPrice('');
    setCurrentPrice('');
  };

  const assetTypes = ['Gold', 'Stock', 'Crypto', 'Cash', 'Real Estate'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Investments</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-primary text-primary-foreground p-2 rounded-full hover:opacity-90 transition-opacity"
        >
          <Plus size={24} />
        </button>
      </div>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card p-6 rounded-2xl border border-border">
          <p className="text-sm text-muted-foreground mb-1">Total Portfolio Value</p>
          <h2 className="text-3xl font-bold">{formatAmount(totalValue)}</h2>
        </div>
        <div className="bg-card p-6 rounded-2xl border border-border">
          <p className="text-sm text-muted-foreground mb-1">Total Profit/Loss</p>
          <div className="flex items-center gap-2">
            <h2 className={`text-3xl font-bold ${profitLoss.profit_loss >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
              {profitLoss.profit_loss >= 0 ? '+' : ''}{formatAmount(profitLoss.profit_loss)}
            </h2>
            <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${profitLoss.profit_loss >= 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-destructive/10 text-destructive'}`}>
              {profitLoss.profit_loss >= 0 ? '+' : ''}{profitLoss.profit_loss_pct.toFixed(2)}%
            </span>
          </div>
        </div>
      </div>

      {/* Asset List */}
      <div className="space-y-3">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <Coins size={20} className="text-primary" />
          Your Assets
        </h3>
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-2xl" />)}
          </div>
        ) : investments.length === 0 ? (
          <div className="bg-card p-12 rounded-2xl border border-dashed border-border text-center">
            <BarChart3 size={48} className="mx-auto mb-4 text-muted-foreground opacity-20" />
            <p className="text-muted-foreground">No investments tracked yet</p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="mt-4 text-primary font-medium hover:underline"
            >
              Add your first asset
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {investments.map((inv) => {
              const currentVal = inv.units * inv.current_price;
              const costVal = inv.units * inv.average_buy_price;
              const pl = currentVal - costVal;
              const plPct = costVal > 0 ? (pl / costVal) * 100 : 0;

              return (
                <div key={inv.id} className="bg-card p-5 rounded-2xl border border-border group hover:border-primary/50 transition-colors">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded-md mb-2 inline-block">
                        {inv.type}
                      </span>
                      <h4 className="font-bold text-lg">{inv.name}</h4>
                      <p className="text-xs text-muted-foreground">
                        {inv.units} units @ {formatAmount(inv.average_buy_price)}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDelete(inv.id)}
                      className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>

                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Current Value</p>
                      <p className="text-xl font-bold">{formatAmount(currentVal)}</p>
                    </div>
                    <div className={`text-right ${pl >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                      <div className="flex items-center justify-end gap-1 text-sm font-bold">
                        {pl >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        {pl >= 0 ? '+' : ''}{plPct.toFixed(1)}%
                      </div>
                      <p className="text-xs opacity-80">{pl >= 0 ? '+' : ''}{formatAmount(pl)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Asset Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-card border border-border w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h2 className="text-xl font-bold">Add Asset</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Asset Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Apple Stock, Gold Bar"
                  className="w-full bg-muted border-none rounded-xl p-3 focus:ring-2 focus:ring-primary outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Asset Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {assetTypes.map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setType(t)}
                      className={`py-2 px-1 rounded-lg text-xs font-medium border-2 transition-all ${type === t ? 'border-primary bg-primary/5 text-primary' : 'border-transparent bg-muted text-muted-foreground'
                        }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Units</label>
                  <input
                    type="number"
                    step="any"
                    value={units}
                    onChange={(e) => setUnits(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-muted border-none rounded-xl p-3 focus:ring-2 focus:ring-primary outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Avg Buy Price</label>
                  <input
                    type="number"
                    step="any"
                    value={buyPrice}
                    onChange={(e) => setBuyPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-muted border-none rounded-xl p-3 focus:ring-2 focus:ring-primary outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Current Price (Optional)</label>
                <input
                  type="number"
                  step="any"
                  value={currentPrice}
                  onChange={(e) => setCurrentPrice(e.target.value)}
                  placeholder="Defaults to Buy Price"
                  className="w-full bg-muted border-none rounded-xl p-3 focus:ring-2 focus:ring-primary outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-primary text-primary-foreground py-4 rounded-2xl font-bold mt-4 hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                <PlusCircle size={20} />
                Track Asset
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Investments;
