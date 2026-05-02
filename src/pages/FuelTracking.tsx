import React, { useState, useEffect } from 'react';
import { Fuel, Plus, Trash2, Calendar, Droplets, Banknote, Tag, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getFuelLogs, addFuelLog, deleteFuelLog } from '../db/queries';
import type { FuelLog } from '../db/queries';

const FUEL_TYPES = ['Petrol', 'High Octane', 'LPG', 'CNG', 'Diesel'];

const FuelTracking: React.FC = () => {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<FuelLog[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Form state
  const [fuelType, setFuelType] = useState('Petrol');
  const [totalAmount, setTotalAmount] = useState('');
  const [pricePerLiter, setPricePerLiter] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const data = await getFuelLogs();
      setLogs(data);
    } catch (error) {
      console.error('Failed to load fuel logs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const calculatedLiters = () => {
    const amount = parseFloat(totalAmount);
    const price = parseFloat(pricePerLiter);
    if (isNaN(amount) || isNaN(price) || price === 0) return 0;
    return (amount / price).toFixed(2);
  };

  const handleAddLog = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(totalAmount);
    const price = parseFloat(pricePerLiter);
    const liters = parseFloat(calculatedLiters() as string);

    if (isNaN(amount) || isNaN(price) || isNaN(liters)) return;

    try {
      await addFuelLog(fuelType, price, amount, liters, date);
      setTotalAmount('');
      setPricePerLiter('');
      setShowAddModal(false);
      loadLogs();
    } catch (error) {
      console.error('Failed to add fuel log:', error);
    }
  };

  const handleDeleteLog = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this fuel log?')) return;
    try {
      await deleteFuelLog(id);
      loadLogs();
    } catch (error) {
      console.error('Failed to delete fuel log:', error);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/more')}
            className="p-2 hover:bg-accent rounded-full transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Fuel Tracking</h1>
            <p className="text-muted-foreground">Monitor your fuel consumption and costs.</p>
          </div>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl font-medium hover:opacity-90 transition-all shadow-lg shadow-primary/20"
        >
          <Plus size={20} />
          <span>Add Log</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
          <div className="flex items-center gap-3 text-primary mb-2">
            <Banknote size={20} />
            <span className="text-sm font-medium uppercase tracking-wider">Total Spent</span>
          </div>
          <div className="text-2xl font-bold">
            {logs.reduce((acc, log) => acc + log.total_cost, 0).toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground mt-1">All time fuel expenses</p>
        </div>
        <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
          <div className="flex items-center gap-3 text-blue-500 mb-2">
            <Droplets size={20} />
            <span className="text-sm font-medium uppercase tracking-wider">Total Liters</span>
          </div>
          <div className="text-2xl font-bold">
            {logs.reduce((acc, log) => acc + log.liters, 0).toFixed(2)} L
          </div>
          <p className="text-xs text-muted-foreground mt-1">Total volume consumed</p>
        </div>
        <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
          <div className="flex items-center gap-3 text-amber-500 mb-2">
            <Fuel size={20} />
            <span className="text-sm font-medium uppercase tracking-wider">Avg. Price</span>
          </div>
          <div className="text-2xl font-bold">
            {(logs.length > 0
              ? logs.reduce((acc, log) => acc + log.price_per_liter, 0) / logs.length
              : 0).toFixed(2)}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Average price per liter</p>
        </div>
      </div>

      {/* Logs Table/List */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/30">
          <h2 className="font-semibold">Recent Logs</h2>
        </div>
        <div className="divide-y divide-border">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading logs...</div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center">
              <div className="inline-flex p-4 rounded-full bg-muted mb-4">
                <Fuel size={32} className="text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium">No fuel logs yet</h3>
              <p className="text-muted-foreground max-w-xs mx-auto mt-1">
                Start tracking your fuel consumption by adding your first log.
              </p>
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="p-4 hover:bg-muted/30 transition-colors flex items-center justify-between group">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <Fuel size={24} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{log.fuel_type}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                        {log.liters} L
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1">
                        <Calendar size={14} />
                        {new Date(log.date).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Tag size={14} />
                        {log.price_per_liter}/L
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-bold text-lg">{log.total_cost.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">Total Cost</div>
                  </div>
                  <button
                    onClick={() => handleDeleteLog(log.id)}
                    className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add Log Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-md rounded-2xl border border-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h2 className="text-xl font-bold">Add Fuel Log</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 hover:bg-muted rounded-full transition-colors"
              >
                <Plus size={24} className="rotate-45" />
              </button>
            </div>
            <form onSubmit={handleAddLog} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Fuel Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {FUEL_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFuelType(type)}
                      className={`px-3 py-2 rounded-xl text-sm font-medium border transition-all ${fuelType === type
                          ? 'bg-primary border-primary text-primary-foreground shadow-md'
                          : 'bg-card border-border hover:border-primary/50'
                        }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Total Amount</label>
                  <div className="relative">
                    <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                    <input
                      type="number"
                      value={totalAmount}
                      onChange={(e) => setTotalAmount(e.target.value)}
                      placeholder="e.g. 3600"
                      className="w-full bg-muted/50 border border-border rounded-xl py-2.5 pl-10 pr-4 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Price per Liter</label>
                  <div className="relative">
                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                    <input
                      type="number"
                      step="0.01"
                      value={pricePerLiter}
                      onChange={(e) => setPricePerLiter(e.target.value)}
                      placeholder="e.g. 300,320,400"
                      className="w-full bg-muted/50 border border-border rounded-xl py-2.5 pl-10 pr-4 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10 flex items-center justify-between">
                <div>
                  <div className="text-xs text-primary font-semibold uppercase tracking-wider">Calculated Quantity</div>
                  <div className="text-2xl font-bold text-primary">{calculatedLiters()} L</div>
                </div>
                <Droplets size={32} className="text-primary/20" />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-muted/50 border border-border rounded-xl py-2.5 pl-10 pr-4 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    required
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl font-medium border border-border hover:bg-muted transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 rounded-xl font-medium bg-primary text-primary-foreground hover:opacity-90 transition-all shadow-lg shadow-primary/20"
                >
                  Save Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FuelTracking;
