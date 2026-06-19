import React, { useState, useEffect } from 'react';
import {
  addTransaction,
  getTransaction,
  updateTransaction,
  getCategories,
  getAccounts,
  addFuelLog,
  getFuelLogByTransactionId,
  deleteFuelLog,
  getVehicles,
  addVehicleExpense,
  getVehicleExpenseByTransactionId,
  deleteVehicleExpense
} from '../db/queries';
import type { Category, Account, Vehicle } from '../db/queries';
import { useNavigate, useParams } from 'react-router-dom';
import { Landmark, RefreshCw, ArrowRightLeft, FileText, Plus } from 'lucide-react';
import { useCurrency } from '../contexts/CurrencyContext';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { uploadToCloudinary } from '../services/cloudinaryService';

const AddTransaction: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { currency } = useCurrency();

  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [type, setType] = useState<'income' | 'expense' | 'transfer'>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [subcategories, setSubcategories] = useState<Category[]>([]);
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState('Debit Card');
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [loading, setLoading] = useState(false);

  // Vehicle Expense Integration
  const [isVehicleExpense, setIsVehicleExpense] = useState(false);
  const [vehicleExpenseType, setVehicleExpenseType] = useState('Fuel');
  const [fuelType, setFuelType] = useState('Petrol');
  const [pricePerLiter, setPricePerLiter] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [existingFuelLogId, setExistingFuelLogId] = useState<string | null>(null);
  const [existingVehicleExpenseId, setExistingVehicleExpenseId] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');

  // Document Viewer State
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  const getUrlType = (url: string): 'image' | 'video' | 'pdf' => {
    const lower = url.toLowerCase();
    if (lower.includes('/video/upload/') || lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov') || lower.endsWith('.avi')) {
      return 'video';
    }
    if (lower.includes('/raw/upload/') || lower.endsWith('.pdf')) {
      return 'pdf';
    }
    return 'image';
  };

  const getVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src);
        resolve(video.duration);
      };
      video.onerror = () => {
        window.URL.revokeObjectURL(video.src);
        resolve(0);
      };
      video.src = window.URL.createObjectURL(file);
    });
  };

  const validateAndUpload = async (file: File, folder: string): Promise<string> => {
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > 10) {
      throw new Error('File size exceeds the 10MB limit.');
    }

    const type = file.type.toLowerCase();
    if (type.startsWith('video/')) {
      if (type !== 'video/mp4') {
        throw new Error('Only MP4 videos are supported.');
      }
      const duration = await getVideoDuration(file);
      if (duration < 5.8 || duration > 8.2) {
        throw new Error(`Video duration must be between 6 to 8 seconds. Selected video is ${duration.toFixed(1)} seconds.`);
      }
    } else if (!type.startsWith('image/') && type !== 'application/pdf') {
      throw new Error('Unsupported file format. Please upload an image, PDF, or MP4 video.');
    }

    return await uploadToCloudinary(file, folder);
  };

  // Multi-Currency Transfer
  const [rates, setRates] = useState<Record<string, number>>({});
  const [exchangeRate, setExchangeRate] = useState<string>('1');
  const [toAmount, setToAmount] = useState<string>('');
  const [useCustomRate, setUseCustomRate] = useState(false);
  const [fetchingRates, setFetchingRates] = useState(false);

  // MEXC Integration
  const [mexcBalances, setMexcBalances] = useState<Record<string, string>>({});




  useEffect(() => {
    const loadInitialData = async () => {
      const [cats, accs, vehs] = await Promise.all([
        getCategories(type === 'transfer' ? undefined : type),
        getAccounts(),
        getVehicles()
      ]);
      setCategories(cats);
      setAccounts(accs);
      setVehicles(vehs);

      // Only set initial bank/account if not already set or editing
      if (!id) {
        if (accs.length > 0 && !accountId) setAccountId(accs[0].id);
        if (accs.length > 1 && !toAccountId) setToAccountId(accs[1].id);
        if (cats.length > 0) setCategory(cats[0].name);
        if (vehs.length > 0) setSelectedVehicleId(vehs[0].id);
      }

      if (id) {
        setLoading(true);
        const trx = await getTransaction(id);
        if (trx) {
          setType(trx.type);
          setAmount(trx.amount.toString());
          setCategory(trx.category);
          setCategoryId(''); // Will be resolved by name matching if ID not stored
          setSubcategory(trx.subcategory || '');
          setSubcategoryId('');
          setDescription(trx.description || '');
          setDate(trx.date);
          setPaymentMethod(trx.payment_method);
          setAccountId(trx.account_id || '');
          setToAccountId(trx.to_account_id || '');

          // Check for vehicle expense or fuel log
          if (trx.type === 'expense') {
            const fuelLog = await getFuelLogByTransactionId(id);
            if (fuelLog) {
              setIsVehicleExpense(true);
              setVehicleExpenseType('Fuel');
              setFuelType(fuelLog.fuel_type);
              setPricePerLiter(fuelLog.price_per_liter.toString());
              setAttachmentUrl(fuelLog.attachment_url || null);
              setExistingFuelLogId(fuelLog.id);
              setSelectedVehicleId(fuelLog.vehicle_id || '');
            } else {
              const vExp = await getVehicleExpenseByTransactionId(id);
              if (vExp) {
                setIsVehicleExpense(true);
                setVehicleExpenseType(vExp.expense_type);
                setAttachmentUrl(vExp.attachment_url);
                setExistingVehicleExpenseId(vExp.id);
                setSelectedVehicleId(vExp.vehicle_id);
              }
            }
          }

          if (trx.type === 'transfer') {
            setExchangeRate(trx.exchange_rate?.toString() || '1');
            setToAmount(trx.to_amount?.toString() || trx.amount.toString());
            // If the rate stored is not 1, assume custom or at least show it
            if (trx.exchange_rate && trx.exchange_rate !== 1) {
              setUseCustomRate(true);
            }
          }
        }
        setLoading(false);
      }
    };
    loadInitialData();
    fetchRates(); // Prefetch rates
    loadMexcKeys();
  }, [id, type]);

  const loadMexcKeys = async () => {
    const { getConfig } = await import('../db/queries');
    const [key, secret] = await Promise.all([
      getConfig('mexc_api_key'),
      getConfig('mexc_api_secret')
    ]);
    if (key && secret) {
      fetchMexcBalances(key, secret);
    }
  };

  const fetchMexcBalances = async (key: string, secret: string) => {
    try {
      const { getMEXCData } = await import('../db/queries');
      const data = await getMEXCData(key, secret);
      if (data && data.balances) {
        const balances: Record<string, string> = {};
        data.balances.forEach((b: any) => {
          if (parseFloat(b.free) > 0 || parseFloat(b.locked) > 0) {
            balances[b.asset] = (parseFloat(b.free) + parseFloat(b.locked)).toString();
          }
        });
        setMexcBalances(balances);
      }
    } catch (e) {
      console.error('Failed to fetch MEXC balances', e);
    }
  };



  const fetchRates = async () => {
    setFetchingRates(true);
    try {
      const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      if (!res.ok) throw new Error('Failed to fetch rates');
      const data = await res.json();
      
      // If we have MEXC keys and it's a crypto transfer, we can augment with MEXC prices
      const ratesData = { ...data.rates };
      setRates(ratesData);
    } catch (error) {
      console.error('Error fetching rates:', error);
      setRates({ USD: 1, PKR: 280, EUR: 0.92, GBP: 0.79, AED: 3.67, SAR: 3.75 });
    } finally {
      setFetchingRates(false);
    }
  };

  const fromAccount = accounts.find(a => a.id === accountId);
  const toAccount = accounts.find(a => a.id === toAccountId);
  const isCrossCurrency = type === 'transfer' && fromAccount && toAccount && fromAccount.currency !== toAccount.currency;

  useEffect(() => {
    const updateExchangeRate = async () => {
      if (isCrossCurrency && !useCustomRate) {
        // Priority 1: If it's crypto-to-crypto or crypto-to-USD, try MEXC
        const isFromCrypto = ['BTC', 'ETH', 'USDT', 'BNB', 'SOL'].includes(fromAccount.currency);
        const isToCrypto = ['BTC', 'ETH', 'USDT', 'BNB', 'SOL'].includes(toAccount.currency);

        if (isFromCrypto || isToCrypto) {
          const { fetchCryptoPrice } = await import('../db/queries');
          if (fromAccount.currency === 'USDT' || fromAccount.currency === 'USD') {
            const price = await fetchCryptoPrice(toAccount.currency);
            if (price) {
              // 1 USDT = (1/price) Crypto (e.g. 1 USDT = 1/60000 BTC)
              setExchangeRate((1 / price).toFixed(10));
              return;
            }
          } else if (toAccount.currency === 'USDT' || toAccount.currency === 'USD') {
            const price = await fetchCryptoPrice(fromAccount.currency);
            if (price) {
              // 1 Crypto = price USDT (e.g. 1 BTC = 60000 USDT)
              setExchangeRate(price.toString());
              return;
            }
          }
        }

        // Fallback to fiat rates
        if (Object.keys(rates).length > 0) {
          const rateFrom = rates[fromAccount.currency] || 1;
          const rateTo = rates[toAccount.currency] || 1;
          const actualRate = rateTo / rateFrom;
          setExchangeRate(actualRate.toFixed(6));
        }
      }
    };
    updateExchangeRate();
  }, [isCrossCurrency, useCustomRate, accountId, toAccountId, rates]);

  useEffect(() => {
    if (type === 'transfer' && amount && exchangeRate && !isNaN(Number(amount)) && !isNaN(Number(exchangeRate))) {
      // Use 8 decimals for crypto/target amounts to support precision
      setToAmount((Number(amount) * Number(exchangeRate)).toFixed(8).replace(/\.?0+$/, ''));
    }
  }, [amount, exchangeRate, type]);

  useEffect(() => {
    const loadSubcategories = async () => {
      if (category && type !== 'transfer') {
        const parent = categoryId 
          ? categories.find(c => c.id === categoryId)
          : categories.find(c => c.name === category);
        if (parent) {
          if (!categoryId) setCategoryId(parent.id);
          const subs = await getCategories(type as any, parent.id);
          setSubcategories(subs);
        }
      } else {
        setSubcategories([]);
      }
    };
    loadSubcategories();
  }, [category, type, categories]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (type === 'expense' && isVehicleExpense) {
      if (vehicles.length === 0) {
        toast.error('Please create a vehicle first in the Fuel Tracking section.');
        return;
      }
      if (!selectedVehicleId) {
        toast.error('Please select a vehicle.');
        return;
      }
      if (vehicleExpenseType === 'Fuel' && (!pricePerLiter || isNaN(Number(pricePerLiter)) || Number(pricePerLiter) <= 0)) {
        toast.error('Please enter a valid price per liter.');
        return;
      }
    }

    if (type === 'transfer' && (!accountId || !toAccountId)) {
      toast.error('Please select both accounts for the transfer');
      return;
    }

    if (type === 'transfer' && accountId === toAccountId) {
      toast.error('Source and destination accounts must be different');
      return;
    }

    try {
      const trxId = id || uuidv4();
      const now = new Date().toISOString();
      const deviceId = localStorage.getItem('deviceId') || 'unknown';

      const trxData = {
        id: trxId,
        type,
        amount: Number(amount),
        category: type === 'transfer' ? 'Transfer' : category,
        description,
        date,
        payment_method: paymentMethod,
        account_id: accountId || null,
        to_account_id: type === 'transfer' ? toAccountId : null,
        created_at: now,
        updated_at: now,
        deviceId,
        subcategory: type === 'transfer' ? null : subcategory || null,
        to_amount: type === 'transfer' ? Number(toAmount || amount) : null,
        exchange_rate: type === 'transfer' ? Number(exchangeRate || 1) : 1
      };

      if (id) {
        await updateTransaction(id, trxData);

        if (type === 'expense') {
          // Clean up old log types if changed
          if (existingFuelLogId && (!isVehicleExpense || vehicleExpenseType !== 'Fuel')) {
            await deleteFuelLog(existingFuelLogId);
          }
          if (existingVehicleExpenseId && (!isVehicleExpense || vehicleExpenseType === 'Fuel')) {
            await deleteVehicleExpense(existingVehicleExpenseId);
          }

          if (isVehicleExpense) {
            if (vehicleExpenseType === 'Fuel') {
              const liters = Number(amount) / Number(pricePerLiter);
              if (!isNaN(liters) && liters > 0) {
                if (existingFuelLogId) {
                  await deleteFuelLog(existingFuelLogId);
                }
                await addFuelLog(fuelType, Number(pricePerLiter), Number(amount), liters, date, undefined, id, selectedVehicleId || null, attachmentUrl);
              }
            } else {
              if (existingVehicleExpenseId) {
                await deleteVehicleExpense(existingVehicleExpenseId);
              }
              await addVehicleExpense(selectedVehicleId, vehicleExpenseType, Number(amount), date, description || '', attachmentUrl, id);
            }
          }
        }
      } else {
        await addTransaction(
          trxData.type,
          trxData.amount,
          trxData.category,
          trxData.description,
          trxData.date,
          trxData.payment_method,
          trxData.account_id,
          trxData.to_account_id,
          trxData.subcategory,
          trxData.id,
          undefined,
          trxData.to_amount,
          trxData.exchange_rate
        );

        if (isVehicleExpense && type === 'expense') {
          if (vehicleExpenseType === 'Fuel') {
            const liters = Number(amount) / Number(pricePerLiter);
            if (!isNaN(liters) && liters > 0) {
              await addFuelLog(fuelType, Number(pricePerLiter), Number(amount), liters, date, undefined, trxId, selectedVehicleId || null, attachmentUrl);
            }
          } else {
            await addVehicleExpense(selectedVehicleId, vehicleExpenseType, Number(amount), date, description || '', attachmentUrl, trxId);
          }
        }
      }
      toast.success(id ? 'Transaction updated successfully' : 'Transaction saved successfully');
      navigate('/transactions');
    } catch (error) {
      console.error('Failed to save transaction', error);
      toast.error('Failed to save transaction');
    }
  };

  if (loading) return <div className="text-center py-10">Loading transaction...</div>;


  return (
    <div className="max-w-md mx-auto space-y-6">
      <h1 className="text-2xl font-bold">{id ? 'Edit' : 'Add'} Transaction</h1>

      <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
        <div className="flex bg-muted p-1 rounded-xl mb-6">
          <button
            type="button"
            onClick={() => setType('expense')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${type === 'expense' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
          >
            Expense
          </button>
          <button
            type="button"
            onClick={() => setType('income')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${type === 'income' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
          >
            Income
          </button>
          <button
            type="button"
            onClick={() => setType('transfer')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${type === 'transfer' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
          >
            Transfer
          </button>
          <button
            type="button"
            onClick={() => navigate('/loans', { state: { openAddModal: true } })}
            className="flex-1 py-2 text-sm font-medium rounded-lg transition-colors text-muted-foreground hover:text-foreground"
          >
            Loan
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Amount</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">{currency.symbol}</span>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full pl-8 pr-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-xl font-medium"
                required
              />
              {type === 'transfer' && fromAccount && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {fromAccount.currency}
                </div>
              )}
            </div>
          </div>

          {isCrossCurrency && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-primary uppercase tracking-widest">Target Amount ({toAccount.currency})</label>
                  <div className="bg-primary/10 text-primary px-2 py-0.5 rounded text-[10px] font-bold">CONVERSION</div>
                </div>
                
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    step="0.00000001"
                    value={toAmount}
                    onChange={(e) => {
                      setToAmount(e.target.value);
                      if (amount && Number(amount) > 0) {
                        setExchangeRate((Number(e.target.value) / Number(amount)).toFixed(10));
                        setUseCustomRate(true);
                      }
                    }}
                    className="flex-1 bg-background border border-border/50 rounded-xl px-4 py-2 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <div className="text-muted-foreground">
                    <ArrowRightLeft size={16} />
                  </div>
                </div>

                <div className="pt-2 border-t border-primary/10">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-muted-foreground">Exchange Rate</span>
                      {Number(exchangeRate) > 0 && (
                        <span className="text-[10px] text-primary/60 font-medium">
                          1 {toAccount.currency} = {(1 / Number(exchangeRate)).toFixed(4)} {fromAccount.currency}
                        </span>
                      )}
                    </div>
                    <button 
                      type="button"
                      onClick={() => setUseCustomRate(!useCustomRate)}
                      className={`text-[10px] font-bold px-2 py-1 rounded transition-colors ${useCustomRate ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                    >
                      {useCustomRate ? 'CUSTOM' : 'AUTO'}
                    </button>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">1 {fromAccount.currency} = </span>
                    <input
                      type="number"
                      step="0.0000000001"
                      value={exchangeRate}
                      readOnly={!useCustomRate}
                      onChange={(e) => setExchangeRate(e.target.value)}
                      className={`flex-1 bg-transparent text-sm font-bold focus:outline-none border-b ${useCustomRate ? 'border-primary' : 'border-transparent'}`}
                    />
                    <span className="text-xs text-muted-foreground">{toAccount.currency}</span>
                    <button 
                      type="button" 
                      onClick={fetchRates} 
                      disabled={fetchingRates}
                      className="p-1 hover:bg-primary/10 rounded-full transition-colors text-primary"
                    >
                      <RefreshCw size={14} className={fetchingRates ? 'animate-spin' : ''} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {type !== 'transfer' ? (
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Category</label>
                <select
                  value={categoryId || category}
                  onChange={(e) => {
                    const id = e.target.value;
                    const cat = categories.find(c => c.id === id);
                    if (cat) {
                      setCategoryId(id);
                      setCategory(cat.name);
                      setSubcategoryId('');
                      setSubcategory('');
                    }
                  }}
                  className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                >
                  <option value="" disabled>Select Category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>
            )}

            {type !== 'transfer' && subcategories.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Subcategory</label>
                <select
                  value={subcategoryId || subcategory}
                  onChange={(e) => {
                    const id = e.target.value;
                    const sub = subcategories.find(s => s.id === id);
                    if (sub) {
                      setSubcategoryId(id);
                      setSubcategory(sub.name);
                    } else {
                      setSubcategoryId('');
                      setSubcategory('');
                    }
                  }}
                  className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">No Subcategory</option>
                  {subcategories.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}

            {type !== 'transfer' && (
              <div className={subcategories.length > 0 ? 'col-span-2 md:col-span-1' : ''}>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                {type === 'transfer' ? 'From Account' : 'Account / Bank'}
              </label>
              <div className="relative">
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary appearance-none"
                >
                  <option value="">No Account</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                  ))}
                </select>
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <Landmark size={18} />
                </div>
              </div>
              {fromAccount?.name.toLowerCase().includes('mexc') && mexcBalances[fromAccount.currency] && (
                <div className="mt-1 px-2 flex justify-between items-center animate-in fade-in duration-500">
                  <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Live MEXC Balance:</span>
                  <span className="text-[10px] font-mono font-bold text-foreground">
                    {parseFloat(mexcBalances[fromAccount.currency]).toLocaleString(undefined, { maximumFractionDigits: 8 })} {fromAccount.currency}
                  </span>
                </div>
              )}
            </div>

            {type === 'transfer' && (
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">To Account</label>
                <div className="relative">
                  <select
                    value={toAccountId}
                    onChange={(e) => setToAccountId(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary appearance-none"
                  >
                    <option value="">Select Destination</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>{acc.name}</option>
                    ))}
                  </select>
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <Landmark size={18} />
                  </div>
                </div>
                {toAccount?.name.toLowerCase().includes('mexc') && mexcBalances[toAccount.currency] && (
                  <div className="mt-1 px-2 flex justify-between items-center animate-in fade-in duration-500">
                    <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Live MEXC Balance:</span>
                    <span className="text-[10px] font-mono font-bold text-foreground">
                      {parseFloat(mexcBalances[toAccount.currency]).toLocaleString(undefined, { maximumFractionDigits: 8 })} {toAccount.currency}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {type !== 'transfer' && (
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Payment Method</label>
              <div className="flex flex-wrap gap-2">
                {['Cash', 'Debit Card', 'Credit Card', 'Bank Transfer'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentMethod(m)}
                    className={`px-3 py-2 rounded-lg text-sm transition-all border ${paymentMethod === m
                      ? 'bg-primary/10 border-primary text-primary font-medium'
                      : 'bg-background border-border text-muted-foreground hover:bg-muted'
                      }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Description</label>
            <input
              type="text"
              placeholder={type === 'transfer' ? 'Internal transfer' : 'What was this for?'}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {type === 'expense' && (
            <div className="space-y-4 pt-2">
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${isVehicleExpense ? 'bg-primary border-primary' : 'border-border group-hover:border-primary/50'}`}>
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={isVehicleExpense}
                    onChange={(e) => setIsVehicleExpense(e.target.checked)}
                  />
                  {isVehicleExpense && <svg className="w-4 h-4 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                </div>
                <span className="font-medium">Mark as Vehicle Expense</span>
              </label>

              {isVehicleExpense && (
                <div className="p-4 bg-muted/50 rounded-2xl border border-border space-y-4 animate-in slide-in-from-top-2 duration-200">
                  {/* Vehicle Selection */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">Select Vehicle</label>
                    {vehicles.length === 0 ? (
                      <div className="p-3 bg-destructive/10 text-destructive rounded-xl text-xs font-semibold border border-destructive/20 flex flex-col gap-2">
                        <span>No vehicles registered. Please create a vehicle first under Fuel Tracking.</span>
                        <button
                          type="button"
                          onClick={() => navigate('/fuel')}
                          className="bg-destructive text-destructive-foreground px-3 py-1.5 rounded-lg text-[10px] self-start hover:opacity-90 transition-all font-bold"
                        >
                          Go to Fuel Tracking
                        </button>
                      </div>
                    ) : (
                      <select
                        value={selectedVehicleId}
                        onChange={(e) => setSelectedVehicleId(e.target.value)}
                        className="w-full px-4 py-2.5 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm font-medium"
                        required={isVehicleExpense}
                      >
                        <option value="" disabled>Choose a vehicle</option>
                        {vehicles.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name} ({v.type === 'Other / Custom' ? (v.custom_type || 'Custom') : v.type})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Expense Type Selection */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">Vehicle Expense Type</label>
                    <select
                      value={vehicleExpenseType}
                      onChange={(e) => setVehicleExpenseType(e.target.value)}
                      className="w-full px-4 py-2.5 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm font-medium"
                      required={isVehicleExpense}
                    >
                      {['Fuel', 'Oil Change', 'Tire Replacement', 'Maintenance', 'Repairs', 'Insurance', 'Registration/Token Tax', 'Parking', 'Toll Charges', 'Other'].map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>

                  {vehicleExpenseType === 'Fuel' && (
                    <>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">Fuel Type</label>
                        <div className="flex flex-wrap gap-2">
                          {['Petrol', 'High Octane', 'LPG', 'CNG', 'Diesel'].map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setFuelType(t)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${fuelType === t
                                ? 'bg-primary border-primary text-primary-foreground shadow-sm'
                                : 'bg-background border-border text-muted-foreground hover:border-primary/50'
                                }`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">Price per Liter</label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="e.g. 300,320,400"
                          value={pricePerLiter}
                          onChange={(e) => setPricePerLiter(e.target.value)}
                          className="w-full px-4 py-2.5 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                          required={isVehicleExpense && vehicleExpenseType === 'Fuel'}
                        />
                      </div>

                      {amount && pricePerLiter && !isNaN(Number(amount) / Number(pricePerLiter)) && (
                        <div className="flex justify-between items-center px-2">
                          <span className="text-sm text-muted-foreground">Calculated Quantity:</span>
                          <span className="font-bold text-primary">{(Number(amount) / Number(pricePerLiter)).toFixed(2)} L</span>
                        </div>
                      )}
                    </>
                  )}

                  {/* Attachment Upload */}
                  <div className="space-y-2 pt-2 border-t border-border/40">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">Receipt / Invoice Attachment</label>
                    {attachmentUrl ? (
                      <div className="flex items-center justify-between p-3 bg-primary/5 border border-primary/20 rounded-xl">
                        <button
                          type="button"
                          onClick={() => setViewerUrl(attachmentUrl)}
                          className="text-xs text-primary font-bold hover:underline truncate max-w-[200px]"
                        >
                          📄 View Attached Document
                        </button>
                        <button
                          type="button"
                          onClick={() => setAttachmentUrl(null)}
                          className="text-[10px] bg-destructive text-destructive-foreground font-bold px-2 py-1 rounded-lg"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div className="relative">
                        <input
                          type="file"
                          accept="image/*,application/pdf,video/mp4"
                          disabled={uploadingAttachment}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setUploadingAttachment(true);
                            try {
                              const url = await validateAndUpload(file, 'vehicle_attachments');
                              setAttachmentUrl(url);
                              toast.success('Receipt uploaded successfully');
                            } catch (err: any) {
                              console.error('Cloudinary upload error:', err);
                              toast.error(err.message || 'Failed to upload receipt');
                            } finally {
                              setUploadingAttachment(false);
                            }
                          }}
                          className="w-full text-xs text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary file:cursor-pointer hover:file:bg-primary/20"
                        />
                        {uploadingAttachment && (
                          <span className="text-xs text-primary font-bold animate-pulse absolute right-2 top-1/2 -translate-y-1/2">
                            Uploading...
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="pt-4">
            <button
              type="submit"
              className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-semibold hover:bg-primary/90 transition-colors shadow-md active:scale-[0.98]"
            >
              {id ? 'Update' : 'Save'} {type === 'transfer' ? 'Transfer' : 'Transaction'}
            </button>
          </div>
        </form>
      </div>

      {/* --- IN-SYSTEM DOCUMENT VIEWER MODAL --- */}
      {viewerUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-4xl max-h-[90vh] rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/20">
              <div className="flex items-center gap-2">
                <FileText className="text-primary" size={18} />
                <h3 className="text-sm font-bold text-foreground truncate max-w-[300px] sm:max-w-md">
                  Document Viewer
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViewerUrl(null)}
                className="p-1.5 hover:bg-muted rounded-full transition-colors text-muted-foreground hover:text-foreground"
              >
                <Plus size={20} className="rotate-45" />
              </button>
            </div>
            
            <div className="flex-1 bg-muted/10 p-6 overflow-auto flex items-center justify-center min-h-[300px]">
              {getUrlType(viewerUrl) === 'image' && (
                <img
                  src={viewerUrl}
                  alt="Attachment Preview"
                  className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-md border border-border/40"
                />
              )}
              {getUrlType(viewerUrl) === 'video' && (
                <video
                  src={viewerUrl}
                  controls
                  autoPlay
                  className="max-w-full max-h-[70vh] rounded-lg shadow-md border border-border/40"
                />
              )}
              {getUrlType(viewerUrl) === 'pdf' && (
                <iframe
                  src={viewerUrl}
                  className="w-full h-[70vh] rounded-lg border border-border/40 shadow-sm bg-white"
                  title="PDF Attachment Viewer"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddTransaction;


