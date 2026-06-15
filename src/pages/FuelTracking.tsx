import React, { useState, useEffect } from 'react';
import {
  Fuel,
  Plus,
  Trash2,
  Calendar,
  Droplets,
  Banknote,
  Tag,
  ArrowLeft,
  Bike,
  Car,
  Truck,
  Settings,
  Edit2,
  Wrench,
  Clock,
  ClipboardList,
  FileText,
  UploadCloud,
  CheckCircle2,
  ExternalLink,
  Eye,
  Paperclip,
  User,
  Activity,
  Check
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  getFuelLogs,
  addFuelLog,
  updateFuelLog,
  deleteFuelLog,
  getVehicles,
  addVehicle,
  updateVehicle,
  deleteVehicle,
  getVehicleExpenses,
  addVehicleExpense,
  updateVehicleExpense,
  deleteVehicleExpense,
  getVehicleReminders,
  addVehicleReminder,
  updateVehicleReminder,
  deleteVehicleReminder,
  getAccounts,
  addTransaction
} from '../db/queries';
import type { FuelLog, Vehicle, VehicleExpense, VehicleReminder, Account } from '../db/queries';
import { uploadToCloudinary } from '../services/cloudinaryService';
import { useCurrency } from '../contexts/CurrencyContext';
import { toast } from 'sonner';

const FUEL_TYPES = ['Petrol', 'High Octane', 'LPG', 'CNG', 'Diesel'];
const VEHICLE_TYPES = ['Bike', 'Car', 'Truck', 'Other / Custom'];
const EXPENSE_TYPES = [
  'Fuel',
  'Oil Change',
  'Tire Replacement',
  'Maintenance',
  'Repairs',
  'Insurance',
  'Registration/Token Tax',
  'Parking',
  'Toll Charges',
  'Other'
];
const REMINDER_SERVICE_TYPES = [
  'Oil Change',
  'Engine Tuning',
  'Tire Rotation',
  'Brake Service',
  'Insurance Renewal',
  'Registration Renewal',
  'Other'
];

const FuelTracking: React.FC = () => {
  const navigate = useNavigate();
  const { formatAmount } = useCurrency();
  const [activeTab, setActiveTab] = useState<'logs' | 'expenses' | 'reminders' | 'vehicles'>('logs');
  
  // Data lists
  const [logs, setLogs] = useState<FuelLog[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [expenses, setExpenses] = useState<VehicleExpense[]>([]);
  const [reminders, setReminders] = useState<VehicleReminder[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [isVehiclesLoading, setIsVehiclesLoading] = useState(true);
  const [isExpensesLoading, setIsExpensesLoading] = useState(true);
  const [isRemindersLoading, setIsRemindersLoading] = useState(true);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Fuel Log Form state
  const [editingLog, setEditingLog] = useState<FuelLog | null>(null);
  const [fuelType, setFuelType] = useState('Petrol');
  const [totalAmount, setTotalAmount] = useState('');
  const [pricePerLiter, setPricePerLiter] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [fuelAttachmentUrl, setFuelAttachmentUrl] = useState<string | null>(null);
  const [uploadingFuelAttachment, setUploadingFuelAttachment] = useState(false);

  // Vehicle Form State
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [vehicleName, setVehicleName] = useState('');
  const [vehicleType, setVehicleType] = useState('Car');
  const [customVehicleType, setCustomVehicleType] = useState('');

  // Other Expenses Form State
  const [editingExpense, setEditingExpense] = useState<VehicleExpense | null>(null);
  const [expenseType, setExpenseType] = useState('Oil Change');
  const [expenseCost, setExpenseCost] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [expenseAccountId, setExpenseAccountId] = useState('');
  const [expenseAttachmentUrl, setExpenseAttachmentUrl] = useState<string | null>(null);
  const [uploadingExpenseAttachment, setUploadingExpenseAttachment] = useState(false);

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

  // Reminders Form State
  const [editingReminder, setEditingReminder] = useState<VehicleReminder | null>(null);
  const [reminderServiceType, setReminderServiceType] = useState('Oil Change');
  const [reminderType, setReminderType] = useState<'date' | 'mileage'>('date');
  const [reminderTargetDate, setReminderTargetDate] = useState(new Date().toISOString().split('T')[0]);
  const [reminderTargetMileage, setReminderTargetMileage] = useState('');

  // Vehicle Details Modal State
  const [selectedVehicleDetails, setSelectedVehicleDetails] = useState<Vehicle | null>(null);
  const [vehicleDetailsTab, setVehicleDetailsTab] = useState<'ownership' | 'vault'>('ownership');
  
  // Ownership edit state (mirrors database columns)
  const [ownershipPlate, setOwnershipPlate] = useState('');
  const [ownershipChassis, setOwnershipChassis] = useState('');
  const [ownershipEngine, setOwnershipEngine] = useState('');
  const [ownershipPrice, setOwnershipPrice] = useState('');
  const [ownershipDate, setOwnershipDate] = useState('');
  const [ownershipSeller, setOwnershipSeller] = useState('');
  const [savingOwnership, setSavingOwnership] = useState(false);
  const [uploadingDocType, setUploadingDocType] = useState<string | null>(null);

  useEffect(() => {
    loadLogs();
    loadVehicles();
    loadExpenses();
    loadReminders();
    loadAccounts();
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

  const loadVehicles = async () => {
    setIsVehiclesLoading(true);
    try {
      const data = await getVehicles();
      setVehicles(data);
      if (data.length > 0 && !selectedVehicleId) {
        setSelectedVehicleId(data[0].id);
      }
    } catch (error) {
      console.error('Failed to load vehicles:', error);
    } finally {
      setIsVehiclesLoading(false);
    }
  };

  const loadExpenses = async () => {
    setIsExpensesLoading(true);
    try {
      const data = await getVehicleExpenses();
      setExpenses(data);
    } catch (error) {
      console.error('Failed to load vehicle expenses:', error);
    } finally {
      setIsExpensesLoading(false);
    }
  };

  const loadReminders = async () => {
    setIsRemindersLoading(true);
    try {
      const data = await getVehicleReminders();
      setReminders(data);
    } catch (error) {
      console.error('Failed to load vehicle reminders:', error);
    } finally {
      setIsRemindersLoading(false);
    }
  };

  const loadAccounts = async () => {
    try {
      const data = await getAccounts();
      setAccounts(data);
      if (data.length > 0 && !expenseAccountId) {
        setExpenseAccountId(data[0].id);
      }
    } catch (error) {
      console.error('Failed to load accounts:', error);
    }
  };

  const calculatedLiters = () => {
    const amount = parseFloat(totalAmount);
    const price = parseFloat(pricePerLiter);
    if (isNaN(amount) || isNaN(price) || price === 0) return 0;
    return (amount / price).toFixed(2);
  };

  // Fuel Logs handlers
  const handleCloseAddModal = () => {
    setShowAddModal(false);
    setEditingLog(null);
    setFuelType('Petrol');
    setTotalAmount('');
    setPricePerLiter('');
    setDate(new Date().toISOString().split('T')[0]);
    setFuelAttachmentUrl(null);
    setUploadingFuelAttachment(false);
    if (vehicles.length > 0) {
      setSelectedVehicleId(vehicles[0].id);
    } else {
      setSelectedVehicleId('');
    }
  };

  const handleEditLogClick = (log: FuelLog) => {
    setEditingLog(log);
    setFuelType(log.fuel_type);
    setTotalAmount(log.total_cost.toString());
    setPricePerLiter(log.price_per_liter.toString());
    setDate(log.date);
    setSelectedVehicleId(log.vehicle_id || '');
    setFuelAttachmentUrl(log.attachment_url || null);
    setShowAddModal(true);
  };

  const handleAddLog = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(totalAmount);
    const price = parseFloat(pricePerLiter);
    const liters = parseFloat(calculatedLiters() as string);

    if (isNaN(amount) || isNaN(price) || isNaN(liters)) return;
    if (!selectedVehicleId) {
      alert('Please select a vehicle first.');
      return;
    }

    try {
      if (editingLog) {
        // If there's an existing transaction linked, we should update it
        if (editingLog.transaction_id) {
          const { updateTransaction } = await import('../db/queries');
          await updateTransaction(editingLog.transaction_id, {
            amount: amount,
            date: date
          });
        }
        await updateFuelLog(editingLog.id, {
          fuel_type: fuelType,
          price_per_liter: price,
          total_cost: amount,
          liters: liters,
          date: date,
          vehicle_id: selectedVehicleId,
          attachment_url: fuelAttachmentUrl
        });
        toast.success('Fuel log updated successfully');
      } else {
        // Create matching transaction in ledger
        let transactionId: string | null = null;
        if (accounts.length > 0) {
          const defaultAccId = accounts[0].id;
          const v = vehicles.find(veh => veh.id === selectedVehicleId);
          const vName = v ? v.name : 'Vehicle';
          transactionId = await addTransaction(
            'expense',
            amount,
            'Transport',
            `Fuel - ${fuelType} for ${vName}`,
            date,
            'Cash',
            defaultAccId
          );
        }
        await addFuelLog(fuelType, price, amount, liters, date, undefined, transactionId, selectedVehicleId, fuelAttachmentUrl);
        toast.success('Fuel log saved successfully');
      }
      handleCloseAddModal();
      loadLogs();
    } catch (error) {
      console.error('Failed to save fuel log:', error);
      toast.error('Failed to save fuel log');
    }
  };

  const handleDeleteLog = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this fuel log?')) return;
    try {
      await deleteFuelLog(id);
      toast.success('Fuel log deleted');
      loadLogs();
    } catch (error) {
      console.error('Failed to delete fuel log:', error);
      toast.error('Failed to delete fuel log');
    }
  };

  // Vehicles handlers
  const handleSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleName.trim()) return;

    try {
      const resolvedType = vehicleType;
      const customTypeVal = vehicleType === 'Other / Custom' ? customVehicleType : null;

      if (editingVehicle) {
        await updateVehicle(editingVehicle.id, {
          name: vehicleName.trim(),
          type: resolvedType,
          custom_type: customTypeVal
        });
        toast.success('Vehicle updated');
      } else {
        const newId = await addVehicle(vehicleName.trim(), resolvedType, customTypeVal);
        toast.success('Vehicle registered successfully');
        if (!selectedVehicleId) {
          setSelectedVehicleId(newId);
        }
      }

      setVehicleName('');
      setVehicleType('Car');
      setCustomVehicleType('');
      setEditingVehicle(null);
      setShowVehicleModal(false);
      await loadVehicles();
      await loadLogs();
    } catch (error) {
      console.error('Failed to save vehicle:', error);
      toast.error('Failed to save vehicle');
    }
  };

  const handleEditVehicleClick = (vehicle: Vehicle, e: React.MouseEvent) => {
    e.stopPropagation(); // Stop modal from triggering
    setEditingVehicle(vehicle);
    setVehicleName(vehicle.name);
    setVehicleType(vehicle.type);
    setCustomVehicleType(vehicle.custom_type || '');
    setShowVehicleModal(true);
  };

  const handleDeleteVehicleClick = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Stop modal from triggering
    const vehicleLogs = logs.filter(log => log.vehicle_id === id);
    const vehicleExpenses = expenses.filter(exp => exp.vehicle_id === id);
    const count = vehicleLogs.length + vehicleExpenses.length;
    let confirmMsg = 'Are you sure you want to delete this vehicle?';
    if (count > 0) {
      confirmMsg = `This vehicle has ${count} log(s) and expense(s) linked to it. Deleting it will clear all linked records from database. Proceed?`;
    }

    if (!window.confirm(confirmMsg)) return;

    try {
      await deleteVehicle(id);
      toast.success('Vehicle and all associated records deleted');
      if (selectedVehicleId === id) {
        setSelectedVehicleId('');
      }
      await loadVehicles();
      await loadLogs();
      await loadExpenses();
      await loadReminders();
    } catch (error) {
      console.error('Failed to delete vehicle:', error);
      toast.error('Failed to delete vehicle');
    }
  };

  // Other Expenses handlers
  const handleCloseExpenseModal = () => {
    setShowExpenseModal(false);
    setEditingExpense(null);
    setExpenseType('Oil Change');
    setExpenseCost('');
    setExpenseDescription('');
    setExpenseDate(new Date().toISOString().split('T')[0]);
    setExpenseAttachmentUrl(null);
    setUploadingExpenseAttachment(false);
    if (vehicles.length > 0) {
      setSelectedVehicleId(vehicles[0].id);
    } else {
      setSelectedVehicleId('');
    }
  };

  const handleEditExpenseClick = (exp: VehicleExpense) => {
    setEditingExpense(exp);
    setExpenseType(exp.expense_type);
    setExpenseCost(exp.cost.toString());
    setExpenseDescription(exp.description || '');
    setExpenseDate(exp.date);
    setSelectedVehicleId(exp.vehicle_id);
    setExpenseAttachmentUrl(exp.attachment_url);
    
    // Look up linked account if available
    if (exp.transaction_id) {
      const loadLinkedAcc = async () => {
        const { getTransaction } = await import('../db/queries');
        const trx = await getTransaction(exp.transaction_id!);
        if (trx) {
          setExpenseAccountId(trx.account_id || '');
        }
      };
      loadLinkedAcc();
    }
    
    setShowExpenseModal(true);
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const cost = parseFloat(expenseCost);
    if (isNaN(cost) || cost <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    if (!selectedVehicleId) {
      toast.error('Please select a vehicle');
      return;
    }

    try {
      if (editingExpense) {
        if (editingExpense.transaction_id) {
          const { updateTransaction } = await import('../db/queries');
          await updateTransaction(editingExpense.transaction_id, {
            amount: cost,
            date: expenseDate,
            description: `${expenseType} for vehicle - ${expenseDescription || ''}`,
            account_id: expenseAccountId || null
          });
        }
        await updateVehicleExpense(editingExpense.id, {
          vehicle_id: selectedVehicleId,
          expense_type: expenseType,
          cost: cost,
          date: expenseDate,
          description: expenseDescription || null,
          attachment_url: expenseAttachmentUrl
        });
        toast.success('Expense updated successfully');
      } else {
        let transactionId: string | null = null;
        if (expenseAccountId) {
          const v = vehicles.find(veh => veh.id === selectedVehicleId);
          const vName = v ? v.name : 'Vehicle';
          transactionId = await addTransaction(
            'expense',
            cost,
            'Transport',
            `${expenseType} for ${vName}${expenseDescription ? ` - ${expenseDescription}` : ''}`,
            expenseDate,
            'Cash',
            expenseAccountId
          );
        }
        await addVehicleExpense(
          selectedVehicleId,
          expenseType,
          cost,
          expenseDate,
          expenseDescription || null,
          expenseAttachmentUrl,
          transactionId
        );
        toast.success('Expense recorded successfully');
      }
      handleCloseExpenseModal();
      await loadExpenses();
    } catch (error) {
      console.error('Failed to save vehicle expense:', error);
      toast.error('Failed to save vehicle expense');
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this expense record?')) return;
    try {
      await deleteVehicleExpense(id);
      toast.success('Expense record deleted');
      await loadExpenses();
    } catch (error) {
      console.error('Failed to delete expense record:', error);
      toast.error('Failed to delete expense');
    }
  };

  // Reminders handlers
  const handleCloseReminderModal = () => {
    setShowReminderModal(false);
    setEditingReminder(null);
    setReminderServiceType('Oil Change');
    setReminderType('date');
    setReminderTargetDate(new Date().toISOString().split('T')[0]);
    setReminderTargetMileage('');
    if (vehicles.length > 0) {
      setSelectedVehicleId(vehicles[0].id);
    } else {
      setSelectedVehicleId('');
    }
  };

  const handleEditReminderClick = (rem: VehicleReminder) => {
    setEditingReminder(rem);
    setReminderServiceType(rem.service_type);
    setReminderType(rem.reminder_type as any);
    setReminderTargetDate(rem.target_date || new Date().toISOString().split('T')[0]);
    setReminderTargetMileage(rem.target_mileage ? rem.target_mileage.toString() : '');
    setSelectedVehicleId(rem.vehicle_id);
    setShowReminderModal(true);
  };

  const handleSaveReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicleId) {
      toast.error('Please select a vehicle');
      return;
    }

    try {
      const targetDateVal = reminderType === 'date' ? reminderTargetDate : null;
      const targetMileageVal = reminderType === 'mileage' ? parseInt(reminderTargetMileage) : null;

      if (editingReminder) {
        await updateVehicleReminder(editingReminder.id, {
          vehicle_id: selectedVehicleId,
          service_type: reminderServiceType,
          reminder_type: reminderType,
          target_date: targetDateVal,
          target_mileage: targetMileageVal
        });
        toast.success('Reminder updated');
      } else {
        await addVehicleReminder(
          selectedVehicleId,
          reminderServiceType,
          reminderType,
          targetDateVal,
          targetMileageVal,
          'pending'
        );
        toast.success('Service reminder set successfully');
      }
      handleCloseReminderModal();
      await loadReminders();
    } catch (error) {
      console.error('Failed to save reminder:', error);
      toast.error('Failed to save reminder');
    }
  };

  const handleToggleReminderStatus = async (rem: VehicleReminder) => {
    const newStatus = rem.status === 'completed' ? 'pending' : 'completed';
    try {
      await updateVehicleReminder(rem.id, { status: newStatus });
      toast.success(newStatus === 'completed' ? 'Reminder marked as completed' : 'Reminder marked pending');
      await loadReminders();
    } catch (error) {
      console.error('Failed to update reminder status:', error);
      toast.error('Failed to update status');
    }
  };

  const handleDeleteReminder = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this reminder?')) return;
    try {
      await deleteVehicleReminder(id);
      toast.success('Reminder deleted');
      await loadReminders();
    } catch (error) {
      console.error('Failed to delete reminder:', error);
      toast.error('Failed to delete reminder');
    }
  };

  // Vehicle detail modal
  const handleOpenDetailModal = (vehicle: Vehicle) => {
    setSelectedVehicleDetails(vehicle);
    setVehicleDetailsTab('ownership');
    
    // Set ownership fields
    setOwnershipPlate(vehicle.license_plate || '');
    setOwnershipChassis(vehicle.chassis_number || '');
    setOwnershipEngine(vehicle.engine_number || '');
    setOwnershipPrice(vehicle.purchase_price ? vehicle.purchase_price.toString() : '');
    setOwnershipDate(vehicle.purchase_date || '');
    setOwnershipSeller(vehicle.seller_info || '');
    
    setShowDetailModal(true);
  };

  const handleSaveOwnershipDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicleDetails) return;
    
    setSavingOwnership(true);
    try {
      const updates = {
        license_plate: ownershipPlate.trim() || null,
        chassis_number: ownershipChassis.trim() || null,
        engine_number: ownershipEngine.trim() || null,
        purchase_price: ownershipPrice ? parseFloat(ownershipPrice) : null,
        purchase_date: ownershipDate || null,
        seller_info: ownershipSeller.trim() || null
      };

      await updateVehicle(selectedVehicleDetails.id, updates);
      
      setSelectedVehicleDetails(prev => prev ? { ...prev, ...updates } : null);
      toast.success('Ownership information updated successfully');
      await loadVehicles();
    } catch (err) {
      console.error('Error saving ownership:', err);
      toast.error('Failed to save ownership details');
    } finally {
      setSavingOwnership(false);
    }
  };

  const handleUploadDocument = async (vehicleId: string, docType: 'reg_book_url' | 'insurance_url' | 'license_url' | 'photos_url' | 'service_records_url', file: File) => {
    setUploadingDocType(docType);
    try {
      const secureUrl = await validateAndUpload(file, 'vehicle_docs');
      
      // Update vehicle in DB
      await updateVehicle(vehicleId, {
        [docType]: secureUrl
      });
      
      // Update details modal view state
      if (selectedVehicleDetails && selectedVehicleDetails.id === vehicleId) {
        setSelectedVehicleDetails(prev => prev ? { ...prev, [docType]: secureUrl } : null);
      }
      
      toast.success('Document uploaded successfully');
      await loadVehicles();
    } catch (err: any) {
      console.error('Error uploading document:', err);
      toast.error(err.message || 'Failed to upload document');
    } finally {
      setUploadingDocType(null);
    }
  };

  const handleRemoveDocument = async (vehicleId: string, docType: 'reg_book_url' | 'insurance_url' | 'license_url' | 'photos_url' | 'service_records_url') => {
    if (!window.confirm('Are you sure you want to remove this document?')) return;
    try {
      await updateVehicle(vehicleId, {
        [docType]: null
      });
      
      // Update details modal view state
      if (selectedVehicleDetails && selectedVehicleDetails.id === vehicleId) {
        setSelectedVehicleDetails(prev => prev ? { ...prev, [docType]: null } : null);
      }
      
      toast.success('Document removed');
      await loadVehicles();
    } catch (err) {
      console.error('Error removing document:', err);
      toast.error('Failed to remove document');
    }
  };

  // Helper icons and stats
  const getVehicleIcon = (type: string) => {
    switch (type) {
      case 'Bike':
        return <Bike size={20} />;
      case 'Truck':
        return <Truck size={20} />;
      case 'Car':
        return <Car size={20} />;
      default:
        return <Settings size={20} />;
    }
  };

  const getVehicleStats = (vehicleId: string) => {
    const vehicleLogs = logs.filter(l => l.vehicle_id === vehicleId);
    const vehicleExpenses = expenses.filter(e => e.vehicle_id === vehicleId);

    const fuelCost = vehicleLogs.reduce((sum, l) => sum + l.total_cost, 0);
    const otherCost = vehicleExpenses.reduce((sum, e) => sum + e.cost, 0);
    const totalCost = fuelCost + otherCost;
    
    const totalLiters = vehicleLogs.reduce((sum, l) => sum + l.liters, 0);
    const avgPrice = totalLiters > 0 ? fuelCost / totalLiters : 0;

    // Calculate consumption per day
    const sorted = [...vehicleLogs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const grouped: { date: string; liters: number }[] = [];
    for (const log of sorted) {
      const existing = grouped.find(g => g.date === log.date);
      if (existing) {
        existing.liters += log.liters;
      } else {
        grouped.push({ date: log.date, liters: log.liters });
      }
    }

    let consumptionPerDay = 0;
    if (grouped.length >= 2) {
      const earliest = new Date(grouped[0].date);
      const latest = new Date(grouped[grouped.length - 1].date);
      const diffTime = latest.getTime() - earliest.getTime();
      const diffDays = diffTime / (1000 * 3600 * 24);
      if (diffDays > 0) {
        const litersConsumed = grouped.slice(0, -1).reduce((sum, g) => sum + g.liters, 0);
        consumptionPerDay = litersConsumed / diffDays;
      }
    }

    return {
      count: vehicleLogs.length,
      fuelCost,
      otherCost,
      cost: totalCost,
      liters: totalLiters,
      avgPrice,
      consumptionPerDay
    };
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/more')}
            className="p-2 hover:bg-accent rounded-full transition-colors text-foreground"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Fuel & Vehicles Hub</h1>
            <p className="text-muted-foreground">Manage vehicles, log fuel and expenses, set service reminders.</p>
          </div>
        </div>
        
        {activeTab === 'logs' && (
          <button
            onClick={() => {
              if (vehicles.length === 0) {
                toast.error('Please add a vehicle first.');
                setActiveTab('vehicles');
                setShowVehicleModal(true);
                return;
              }
              handleCloseAddModal();
              setShowAddModal(true);
            }}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl font-medium hover:opacity-90 transition-all shadow-lg shadow-primary/20 text-sm active:scale-95"
          >
            <Plus size={18} />
            <span>Add Log</span>
          </button>
        )}

        {activeTab === 'expenses' && (
          <button
            onClick={() => {
              if (vehicles.length === 0) {
                toast.error('Please add a vehicle first.');
                setActiveTab('vehicles');
                setShowVehicleModal(true);
                return;
              }
              handleCloseExpenseModal();
              setShowExpenseModal(true);
            }}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl font-medium hover:opacity-90 transition-all shadow-lg shadow-primary/20 text-sm active:scale-95"
          >
            <Plus size={18} />
            <span>Add Expense</span>
          </button>
        )}

        {activeTab === 'reminders' && (
          <button
            onClick={() => {
              if (vehicles.length === 0) {
                toast.error('Please add a vehicle first.');
                setActiveTab('vehicles');
                setShowVehicleModal(true);
                return;
              }
              handleCloseReminderModal();
              setShowReminderModal(true);
            }}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl font-medium hover:opacity-90 transition-all shadow-lg shadow-primary/20 text-sm active:scale-95"
          >
            <Plus size={18} />
            <span>Add Reminder</span>
          </button>
        )}

        {activeTab === 'vehicles' && (
          <button
            onClick={() => {
              setEditingVehicle(null);
              setVehicleName('');
              setVehicleType('Car');
              setCustomVehicleType('');
              setShowVehicleModal(true);
            }}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl font-medium hover:opacity-90 transition-all shadow-lg shadow-primary/20 text-sm active:scale-95"
          >
            <Plus size={18} />
            <span>Add Vehicle</span>
          </button>
        )}
      </div>

      {/* Navigation Tabs (Glassmorphism design) */}
      <div className="flex bg-muted p-1 rounded-2xl w-full border border-border/40 overflow-x-auto scrollbar-none gap-1">
        <button
          onClick={() => setActiveTab('logs')}
          className={`flex-1 min-w-[90px] py-2 px-3 text-xs md:text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-all duration-300 whitespace-nowrap ${activeTab === 'logs' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Fuel size={16} /> Fuel Logs
        </button>
        <button
          onClick={() => setActiveTab('expenses')}
          className={`flex-1 min-w-[110px] py-2 px-3 text-xs md:text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-all duration-300 whitespace-nowrap ${activeTab === 'expenses' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Banknote size={16} /> Other Expenses
        </button>
        <button
          onClick={() => setActiveTab('reminders')}
          className={`flex-1 min-w-[100px] py-2 px-3 text-xs md:text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-all duration-300 whitespace-nowrap ${activeTab === 'reminders' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Clock size={16} /> Reminders
        </button>
        <button
          onClick={() => setActiveTab('vehicles')}
          className={`flex-1 min-w-[95px] py-2 px-3 text-xs md:text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-all duration-300 whitespace-nowrap ${activeTab === 'vehicles' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Car size={16} /> Vehicles
        </button>
      </div>

      {/* --- TAB: FUEL LOGS --- */}
      {activeTab === 'logs' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
              <div className="flex items-center gap-3 text-primary mb-2">
                <Banknote size={20} />
                <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Total Spent</span>
              </div>
              <div className="text-2xl font-bold">
                {formatAmount(logs.reduce((acc, log) => acc + log.total_cost, 0))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Total fuel expenses recorded</p>
            </div>
            <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
              <div className="flex items-center gap-3 text-blue-500 mb-2">
                <Droplets size={20} />
                <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Total Liters</span>
              </div>
              <div className="text-2xl font-bold">
                {logs.reduce((acc, log) => acc + log.liters, 0).toFixed(2)} L
              </div>
              <p className="text-xs text-muted-foreground mt-1">Total volume consumed</p>
            </div>
            <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
              <div className="flex items-center gap-3 text-amber-500 mb-2">
                <Fuel size={20} />
                <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Avg. Price / L</span>
              </div>
              <div className="text-2xl font-bold">
                {formatAmount(logs.length > 0
                  ? logs.reduce((acc, log) => acc + log.price_per_liter, 0) / logs.length
                  : 0)}/L
              </div>
              <p className="text-xs text-muted-foreground mt-1">Average price per liter of fuel</p>
            </div>
          </div>

          {/* Logs List */}
          <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
            <div className="p-4 border-b border-border bg-muted/20 flex items-center justify-between">
              <h2 className="font-bold text-foreground">Recent Fuel Purchases</h2>
            </div>
            <div className="divide-y divide-border">
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading fuel logs...</div>
              ) : logs.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="inline-flex p-4 rounded-full bg-muted mb-4 text-muted-foreground">
                    <Fuel size={32} />
                  </div>
                  <h3 className="text-lg font-medium">No fuel logs yet</h3>
                  <p className="text-muted-foreground max-w-xs mx-auto mt-1">
                    Start tracking your fuel consumption by adding your first log.
                  </p>
                </div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="p-4 hover:bg-muted/10 transition-all flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <Fuel size={20} />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-sm">{log.fuel_type}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold">
                            {log.liters.toFixed(2)} L
                          </span>
                          {log.vehicle_name && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold flex items-center gap-1 uppercase tracking-wider">
                              {log.vehicle_name}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          <span className="flex items-center gap-1">
                            <Calendar size={12} />
                            {new Date(log.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                          <span>•</span>
                          <span>{formatAmount(log.price_per_liter)}/L</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right flex flex-col items-end">
                        <div className="font-bold text-sm text-foreground">{formatAmount(log.total_cost)}</div>
                        {log.attachment_url && (
                          <button
                            type="button"
                            onClick={() => setViewerUrl(log.attachment_url!)}
                            className="inline-flex items-center gap-1 text-[10px] text-primary font-bold hover:underline mt-1 bg-primary/5 px-2 py-0.5 rounded-lg border border-primary/10"
                          >
                            <Paperclip size={10} /> View Bill
                          </button>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleEditLogClick(log)}
                          className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          onClick={() => handleDeleteLog(log.id)}
                          className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- TAB: OTHER EXPENSES --- */}
      {activeTab === 'expenses' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
              <div className="flex items-center gap-3 text-purple-500 mb-2">
                <Banknote size={20} />
                <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">General Maintenance Cost</span>
              </div>
              <div className="text-2xl font-bold">
                {formatAmount(expenses.reduce((acc, exp) => acc + exp.cost, 0))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Repairs, oil changes, taxes, insurances, etc.</p>
            </div>
            <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
              <div className="flex items-center gap-3 text-primary mb-2">
                <ClipboardList size={20} />
                <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Total Services Logged</span>
              </div>
              <div className="text-2xl font-bold">
                {expenses.length} Records
              </div>
              <p className="text-xs text-muted-foreground mt-1">General maintenance logs in database</p>
            </div>
          </div>

          {/* Expenses List */}
          <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
            <div className="p-4 border-b border-border bg-muted/20">
              <h2 className="font-bold text-foreground">Vehicle Expense Ledger</h2>
            </div>
            <div className="divide-y divide-border">
              {isExpensesLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading expenses...</div>
              ) : expenses.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="inline-flex p-4 rounded-full bg-muted mb-4 text-muted-foreground">
                    <Wrench size={32} />
                  </div>
                  <h3 className="text-lg font-medium">No expense records</h3>
                  <p className="text-muted-foreground max-w-xs mx-auto mt-1">
                    Record oil changes, tire replacements, or parts maintenance to see them here.
                  </p>
                </div>
              ) : (
                expenses.map((exp) => (
                  <div key={exp.id} className="p-4 hover:bg-muted/10 transition-all flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500">
                        <Wrench size={20} />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-sm">{exp.expense_type}</span>
                          {exp.vehicle_name && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold uppercase tracking-wider">
                              {exp.vehicle_name}
                            </span>
                          )}
                        </div>
                        {exp.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{exp.description}</p>
                        )}
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-1">
                          <Calendar size={10} />
                          {new Date(exp.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right flex flex-col items-end">
                        <div className="font-bold text-sm text-foreground">{formatAmount(exp.cost)}</div>
                        {exp.attachment_url && (
                          <button
                            type="button"
                            onClick={() => setViewerUrl(exp.attachment_url!)}
                            className="inline-flex items-center gap-1 text-[10px] text-primary font-bold hover:underline mt-1 bg-primary/5 px-2 py-0.5 rounded-lg border border-primary/10"
                          >
                            <Paperclip size={10} /> View Bill
                          </button>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleEditExpenseClick(exp)}
                          className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          onClick={() => handleDeleteExpense(exp.id)}
                          className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- TAB: REMINDERS --- */}
      {activeTab === 'reminders' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
              <div className="flex items-center gap-3 text-amber-500 mb-2">
                <Clock size={20} />
                <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Pending Reminders</span>
              </div>
              <div className="text-2xl font-bold">
                {reminders.filter(r => r.status === 'pending').length} Active
              </div>
              <p className="text-xs text-muted-foreground mt-1">Reminders awaiting completion</p>
            </div>
            <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
              <div className="flex items-center gap-3 text-emerald-500 mb-2">
                <CheckCircle2 size={20} />
                <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Completed Reminders</span>
              </div>
              <div className="text-2xl font-bold">
                {reminders.filter(r => r.status === 'completed').length} Cleared
              </div>
              <p className="text-xs text-muted-foreground mt-1">Successfully done maintenance works</p>
            </div>
          </div>

          {/* Reminders List */}
          <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
            <div className="p-4 border-b border-border bg-muted/20">
              <h2 className="font-bold text-foreground">Service Schedule</h2>
            </div>
            <div className="divide-y divide-border">
              {isRemindersLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading reminders...</div>
              ) : reminders.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="inline-flex p-4 rounded-full bg-muted mb-4 text-muted-foreground">
                    <Clock size={32} />
                  </div>
                  <h3 className="text-lg font-medium">No service reminders set</h3>
                  <p className="text-muted-foreground max-w-xs mx-auto mt-1">
                    Set a time or mileage based reminder (e.g. Engine tuning in 3 months) to schedule service.
                  </p>
                </div>
              ) : (
                reminders.map((rem) => {
                  const isCompleted = rem.status === 'completed';
                  return (
                    <div key={rem.id} className={`p-4 hover:bg-muted/10 transition-all flex items-center justify-between group ${isCompleted ? 'opacity-65' : ''}`}>
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => handleToggleReminderStatus(rem)}
                          className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${isCompleted ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-border hover:border-primary/50'}`}
                          title={isCompleted ? 'Mark Pending' : 'Mark Completed'}
                        >
                          {isCompleted && <Check size={14} />}
                        </button>
                        
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`font-semibold text-sm ${isCompleted ? 'line-through text-muted-foreground' : ''}`}>{rem.service_type}</span>
                            {rem.vehicle_name && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold uppercase tracking-wider">
                                {rem.vehicle_name}
                              </span>
                            )}
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-semibold">
                              {rem.reminder_type === 'date' ? 'Date-based' : 'Mileage-based'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                            {rem.reminder_type === 'date' ? (
                              <span className="flex items-center gap-1">
                                <Calendar size={12} />
                                Due: {rem.target_date ? new Date(rem.target_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 font-semibold text-amber-500">
                                <Activity size={12} />
                                Target Mileage: {rem.target_mileage?.toLocaleString()} km
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide ${isCompleted ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                          {rem.status}
                        </span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleEditReminderClick(rem)}
                            className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            onClick={() => handleDeleteReminder(rem.id)}
                            className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- TAB: VEHICLES --- */}
      {activeTab === 'vehicles' && (
        <div className="space-y-4">
          {isVehiclesLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading vehicles...</div>
          ) : vehicles.length === 0 ? (
            <div className="p-12 text-center bg-card rounded-2xl border border-border">
              <div className="inline-flex p-4 rounded-full bg-muted mb-4 text-muted-foreground">
                <Car size={32} />
              </div>
              <h3 className="text-lg font-medium">No vehicles registered</h3>
              <p className="text-muted-foreground max-w-xs mx-auto mt-1 mb-4">
                Register your vehicles to track fuel, expenses, reminders, and documents.
              </p>
              <button
                onClick={() => {
                  setEditingVehicle(null);
                  setVehicleName('');
                  setVehicleType('Car');
                  setCustomVehicleType('');
                  setShowVehicleModal(true);
                }}
                className="bg-primary text-primary-foreground px-4 py-2.5 rounded-xl font-medium hover:opacity-90 transition-all shadow-md text-sm"
              >
                Add Your First Vehicle
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {vehicles.map((v) => {
                const stats = getVehicleStats(v.id);
                return (
                  <div
                    key={v.id}
                    onClick={() => handleOpenDetailModal(v)}
                    className="bg-card p-6 rounded-2xl border border-border shadow-sm hover:shadow-md hover:border-primary/30 transition-all flex flex-col justify-between group cursor-pointer active:scale-[0.99]"
                  >
                    <div className="space-y-4">
                      {/* Title row */}
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                            {getVehicleIcon(v.type)}
                          </div>
                          <div>
                            <h3 className="font-bold text-base text-foreground group-hover:text-primary transition-colors leading-tight">{v.name}</h3>
                            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                              {v.type === 'Other / Custom' ? (v.custom_type || 'Custom') : v.type}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={(e) => handleEditVehicleClick(v, e)}
                            className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={(e) => handleDeleteVehicleClick(v.id, e)}
                            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-lg transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Stats grid */}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-3 border-t border-border/60 text-xs">
                        <div className="space-y-0.5">
                          <span className="text-muted-foreground font-medium block">Total Refuels</span>
                          <span className="font-bold text-sm text-foreground">{stats.count}</span>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-muted-foreground font-medium block">Total Fuel Vol</span>
                          <span className="font-bold text-sm text-foreground">{stats.liters.toFixed(1)} L</span>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-muted-foreground font-medium block">Avg Price / L</span>
                          <span className="font-bold text-sm text-amber-500">
                            {stats.avgPrice > 0 ? `${formatAmount(stats.avgPrice)}/L` : '-'}
                          </span>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-muted-foreground font-medium block">Daily Usage</span>
                          <span className="font-bold text-sm text-blue-500">
                            {stats.consumptionPerDay > 0 ? `${stats.consumptionPerDay.toFixed(2)} L/day` : '-'}
                          </span>
                        </div>
                        <div className="space-y-0.5 col-span-2 pt-1 border-t border-border/20 flex justify-between items-center">
                          <span className="text-muted-foreground font-semibold">Total Cost:</span>
                          <span className="font-bold text-foreground text-sm">{formatAmount(stats.cost)}</span>
                        </div>
                      </div>
                      
                      <div className="text-center pt-2">
                        <span className="inline-flex items-center gap-1 text-[10px] text-primary font-bold uppercase tracking-wider group-hover:underline">
                          <Eye size={12} /> View Details & Documents
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* --- MODAL: ADD / EDIT FUEL LOG --- */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-md rounded-2xl border border-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h2 className="text-xl font-bold">{editingLog ? 'Edit Fuel Log' : 'Add Fuel Log'}</h2>
              <button
                onClick={handleCloseAddModal}
                className="p-2 hover:bg-muted rounded-full transition-colors"
              >
                <Plus size={24} className="rotate-45" />
              </button>
            </div>
            <form onSubmit={handleAddLog} className="p-6 space-y-4">
              {/* Vehicle Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Vehicle</label>
                <select
                  value={selectedVehicleId}
                  onChange={(e) => setSelectedVehicleId(e.target.value)}
                  className="w-full bg-muted/50 border border-border rounded-xl py-2.5 px-3 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm font-medium"
                  required
                >
                  <option value="" disabled>Choose a vehicle</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.type === 'Other / Custom' ? (v.custom_type || 'Custom') : v.type})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Fuel Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {FUEL_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFuelType(type)}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${fuelType === type
                        ? 'bg-primary border-primary text-primary-foreground shadow-md'
                        : 'bg-card border-border hover:border-primary/50 text-muted-foreground'
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
                      className="w-full bg-muted/50 border border-border rounded-xl py-2.5 pl-10 pr-4 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
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
                      placeholder="e.g. 300"
                      className="w-full bg-muted/50 border border-border rounded-xl py-2.5 pl-10 pr-4 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10 flex items-center justify-between">
                <div>
                  <div className="text-xs text-primary font-semibold uppercase tracking-wider">Calculated Quantity</div>
                  <div className="text-xl font-bold text-primary">{calculatedLiters()} L</div>
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
                    className="w-full bg-muted/50 border border-border rounded-xl py-2.5 pl-10 pr-4 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
                    required
                  />
                </div>
              </div>

              {/* Bill/Invoice Attachment Upload */}
              <div className="space-y-2 pt-2 border-t border-border/40">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">Fuel Receipt Attachment</label>
                {fuelAttachmentUrl ? (
                  <div className="flex items-center justify-between p-3 bg-primary/5 border border-primary/20 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setViewerUrl(fuelAttachmentUrl)}
                      className="text-xs text-primary font-bold hover:underline truncate max-w-[200px]"
                    >
                      📄 View Attached Receipt
                    </button>
                    <button
                      type="button"
                      onClick={() => setFuelAttachmentUrl(null)}
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
                      disabled={uploadingFuelAttachment}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploadingFuelAttachment(true);
                        try {
                          const url = await validateAndUpload(file, 'vehicle_attachments');
                          setFuelAttachmentUrl(url);
                          toast.success('Receipt uploaded successfully');
                        } catch (err: any) {
                          console.error('Upload error:', err);
                          toast.error(err.message || 'Failed to upload receipt');
                        } finally {
                          setUploadingFuelAttachment(false);
                        }
                      }}
                      className="w-full text-xs text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary file:cursor-pointer hover:file:bg-primary/20"
                    />
                    {uploadingFuelAttachment && (
                      <span className="text-xs text-primary font-bold animate-pulse absolute right-2 top-1/2 -translate-y-1/2">
                        Uploading...
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={handleCloseAddModal}
                  className="flex-1 px-4 py-2.5 rounded-xl font-medium border border-border hover:bg-muted transition-all text-sm text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 rounded-xl font-medium bg-primary text-primary-foreground hover:opacity-90 transition-all shadow-lg shadow-primary/20 text-sm"
                >
                  {editingLog ? 'Update Log' : 'Save Log'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: ADD / EDIT VEHICLE --- */}
      {showVehicleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-md rounded-2xl border border-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h2 className="text-xl font-bold">{editingVehicle ? 'Edit Vehicle' : 'Add Vehicle'}</h2>
              <button
                onClick={() => setShowVehicleModal(false)}
                className="p-2 hover:bg-muted rounded-full transition-colors"
              >
                <Plus size={24} className="rotate-45" />
              </button>
            </div>
            <form onSubmit={handleSaveVehicle} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Vehicle Name / Identifier</label>
                <input
                  type="text"
                  placeholder="e.g. Honda Civic, My Bike"
                  value={vehicleName}
                  onChange={(e) => setVehicleName(e.target.value)}
                  className="w-full bg-muted/50 border border-border rounded-xl py-2.5 px-4 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Vehicle Type</label>
                <select
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value)}
                  className="w-full bg-muted/50 border border-border rounded-xl py-2.5 px-3 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm font-medium"
                  required
                >
                  {VEHICLE_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {vehicleType === 'Other / Custom' && (
                <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                  <label className="text-sm font-medium">Please Specify Vehicle Type</label>
                  <input
                    type="text"
                    placeholder="e.g. SUV, ATV, Yacht"
                    value={customVehicleType}
                    onChange={(e) => setCustomVehicleType(e.target.value)}
                    className="w-full bg-muted/50 border border-border rounded-xl py-2.5 px-4 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
                    required
                  />
                </div>
              )}

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowVehicleModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl font-medium border border-border hover:bg-muted transition-all text-sm text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 rounded-xl font-medium bg-primary text-primary-foreground hover:opacity-90 transition-all shadow-lg shadow-primary/20 text-sm"
                >
                  {editingVehicle ? 'Update Vehicle' : 'Save Vehicle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: ADD / EDIT EXPENSE --- */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-md rounded-2xl border border-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h2 className="text-xl font-bold">{editingExpense ? 'Edit Expense Record' : 'Record Vehicle Expense'}</h2>
              <button
                onClick={handleCloseExpenseModal}
                className="p-2 hover:bg-muted rounded-full transition-colors"
              >
                <Plus size={24} className="rotate-45" />
              </button>
            </div>
            <form onSubmit={handleSaveExpense} className="p-6 space-y-4">
              {/* Vehicle Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Vehicle</label>
                <select
                  value={selectedVehicleId}
                  onChange={(e) => setSelectedVehicleId(e.target.value)}
                  className="w-full bg-muted/50 border border-border rounded-xl py-2.5 px-3 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm font-medium"
                  required
                >
                  <option value="" disabled>Choose a vehicle</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.type === 'Other / Custom' ? (v.custom_type || 'Custom') : v.type})
                    </option>
                  ))}
                </select>
              </div>

              {/* Expense Type Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Expense Type</label>
                <select
                  value={expenseType}
                  onChange={(e) => setExpenseType(e.target.value)}
                  className="w-full bg-muted/50 border border-border rounded-xl py-2.5 px-3 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm font-medium"
                  required
                >
                  {EXPENSE_TYPES.filter(t => t !== 'Fuel').map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              {/* Cost Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Total Cost</label>
                <div className="relative">
                  <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                  <input
                    type="number"
                    value={expenseCost}
                    onChange={(e) => setExpenseCost(e.target.value)}
                    placeholder="e.g. 5000"
                    className="w-full bg-muted/50 border border-border rounded-xl py-2.5 pl-10 pr-4 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
                    required
                  />
                </div>
              </div>

              {/* Ledger Integration - Account selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center justify-between">
                  <span>Deduct From Payment Account</span>
                  <span className="text-[10px] bg-primary/10 text-primary font-bold px-1.5 py-0.5 rounded">Ledger Sync</span>
                </label>
                <select
                  value={expenseAccountId}
                  onChange={(e) => setExpenseAccountId(e.target.value)}
                  className="w-full bg-muted/50 border border-border rounded-xl py-2.5 px-3 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm font-medium"
                >
                  <option value="">Do not log in ledger (Offline/Manual)</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                  <input
                    type="date"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="w-full bg-muted/50 border border-border rounded-xl py-2.5 pl-10 pr-4 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Description / Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Changed Engine Oil, brake pads replacement"
                  value={expenseDescription}
                  onChange={(e) => setExpenseDescription(e.target.value)}
                  className="w-full bg-muted/50 border border-border rounded-xl py-2.5 px-4 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
                />
              </div>

              {/* Attachment upload */}
              <div className="space-y-2 pt-2 border-t border-border/40">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">Invoice / Receipt Attachment</label>
                {expenseAttachmentUrl ? (
                  <div className="flex items-center justify-between p-3 bg-primary/5 border border-primary/20 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setViewerUrl(expenseAttachmentUrl)}
                      className="text-xs text-primary font-bold hover:underline truncate max-w-[200px]"
                    >
                      📄 View Attached Invoice
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpenseAttachmentUrl(null)}
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
                      disabled={uploadingExpenseAttachment}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploadingExpenseAttachment(true);
                        try {
                          const url = await validateAndUpload(file, 'vehicle_attachments');
                          setExpenseAttachmentUrl(url);
                          toast.success('Receipt uploaded successfully');
                        } catch (err: any) {
                          console.error('Upload error:', err);
                          toast.error(err.message || 'Failed to upload receipt');
                        } finally {
                          setUploadingExpenseAttachment(false);
                        }
                      }}
                      className="w-full text-xs text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary file:cursor-pointer hover:file:bg-primary/20"
                    />
                    {uploadingExpenseAttachment && (
                      <span className="text-xs text-primary font-bold animate-pulse absolute right-2 top-1/2 -translate-y-1/2">
                        Uploading...
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={handleCloseExpenseModal}
                  className="flex-1 px-4 py-2.5 rounded-xl font-medium border border-border hover:bg-muted transition-all text-sm text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 rounded-xl font-medium bg-primary text-primary-foreground hover:opacity-90 transition-all shadow-lg shadow-primary/20 text-sm"
                >
                  {editingExpense ? 'Update' : 'Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: ADD / EDIT REMINDER --- */}
      {showReminderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-md rounded-2xl border border-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h2 className="text-xl font-bold">{editingReminder ? 'Edit Reminder' : 'Set Service Reminder'}</h2>
              <button
                onClick={handleCloseReminderModal}
                className="p-2 hover:bg-muted rounded-full transition-colors"
              >
                <Plus size={24} className="rotate-45" />
              </button>
            </div>
            <form onSubmit={handleSaveReminder} className="p-6 space-y-4">
              {/* Vehicle Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Vehicle</label>
                <select
                  value={selectedVehicleId}
                  onChange={(e) => setSelectedVehicleId(e.target.value)}
                  className="w-full bg-muted/50 border border-border rounded-xl py-2.5 px-3 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm font-medium"
                  required
                >
                  <option value="" disabled>Choose a vehicle</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.type === 'Other / Custom' ? (v.custom_type || 'Custom') : v.type})
                    </option>
                  ))}
                </select>
              </div>

              {/* Service Type Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Service / Task</label>
                <select
                  value={reminderServiceType}
                  onChange={(e) => setReminderServiceType(e.target.value)}
                  className="w-full bg-muted/50 border border-border rounded-xl py-2.5 px-3 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm font-medium"
                  required
                >
                  {REMINDER_SERVICE_TYPES.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              {/* Reminder Type Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Reminder Metric</label>
                <div className="flex bg-muted p-1 rounded-xl w-full border border-border/40 gap-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setReminderType('date')}
                    className={`flex-1 py-2 font-semibold rounded-lg transition-all ${reminderType === 'date' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    Date-based
                  </button>
                  <button
                    type="button"
                    onClick={() => setReminderType('mileage')}
                    className={`flex-1 py-2 font-semibold rounded-lg transition-all ${reminderType === 'mileage' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    Mileage-based
                  </button>
                </div>
              </div>

              {reminderType === 'date' ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Target Due Date</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                    <input
                      type="date"
                      value={reminderTargetDate}
                      onChange={(e) => setReminderTargetDate(e.target.value)}
                      className="w-full bg-muted/50 border border-border rounded-xl py-2.5 pl-10 pr-4 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
                      required={reminderType === 'date'}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                  <label className="text-sm font-medium">Target Mileage (in km)</label>
                  <div className="relative">
                    <Activity className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                    <input
                      type="number"
                      placeholder="e.g. 5000, 10000, 25000"
                      value={reminderTargetMileage}
                      onChange={(e) => setReminderTargetMileage(e.target.value)}
                      className="w-full bg-muted/50 border border-border rounded-xl py-2.5 pl-10 pr-4 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
                      required={reminderType === 'mileage'}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground italic px-2">Example: Remind me at 15,000 km to rotate tires.</span>
                </div>
              )}

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={handleCloseReminderModal}
                  className="flex-1 px-4 py-2.5 rounded-xl font-medium border border-border hover:bg-muted transition-all text-sm text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 rounded-xl font-medium bg-primary text-primary-foreground hover:opacity-90 transition-all shadow-lg shadow-primary/20 text-sm"
                >
                  {editingReminder ? 'Update' : 'Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: VEHICLE DETAIL & DOCUMENT VAULT --- */}
      {showDetailModal && selectedVehicleDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-lg rounded-2xl border border-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-foreground">{selectedVehicleDetails.name} Details</h2>
                <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                  {selectedVehicleDetails.type === 'Other / Custom' ? (selectedVehicleDetails.custom_type || 'Custom') : selectedVehicleDetails.type}
                </span>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="p-2 hover:bg-muted rounded-full transition-colors text-foreground"
              >
                <Plus size={24} className="rotate-45" />
              </button>
            </div>

            {/* Inner modal tabs */}
            <div className="flex border-b border-border bg-muted/20 px-4">
              <button
                onClick={() => setVehicleDetailsTab('ownership')}
                className={`py-3 px-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${vehicleDetailsTab === 'ownership' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              >
                <User size={16} /> Ownership Info
              </button>
              <button
                onClick={() => setVehicleDetailsTab('vault')}
                className={`py-3 px-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${vehicleDetailsTab === 'vault' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              >
                <FileText size={16} /> Document Vault
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* OWNERSHIP TAB */}
              {vehicleDetailsTab === 'ownership' && (
                <form onSubmit={handleSaveOwnershipDetails} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">License Plate</label>
                      <input
                        type="text"
                        placeholder="e.g. ABC-1234"
                        value={ownershipPlate}
                        onChange={(e) => setOwnershipPlate(e.target.value)}
                        className="w-full bg-muted/40 border border-border/80 rounded-xl py-2 px-3 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all text-xs font-medium text-foreground"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Purchase Price</label>
                      <input
                        type="number"
                        placeholder="Price paid"
                        value={ownershipPrice}
                        onChange={(e) => setOwnershipPrice(e.target.value)}
                        className="w-full bg-muted/40 border border-border/80 rounded-xl py-2 px-3 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all text-xs font-medium text-foreground"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Purchase Date</label>
                      <input
                        type="date"
                        value={ownershipDate}
                        onChange={(e) => setOwnershipDate(e.target.value)}
                        className="w-full bg-muted/40 border border-border/80 rounded-xl py-2 px-3 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all text-xs font-medium text-foreground"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Seller / Vendor</label>
                      <input
                        type="text"
                        placeholder="Seller information"
                        value={ownershipSeller}
                        onChange={(e) => setOwnershipSeller(e.target.value)}
                        className="w-full bg-muted/40 border border-border/80 rounded-xl py-2 px-3 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all text-xs font-medium text-foreground"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Chassis Number</label>
                      <input
                        type="text"
                        placeholder="Chassis VIN code"
                        value={ownershipChassis}
                        onChange={(e) => setOwnershipChassis(e.target.value)}
                        className="w-full bg-muted/40 border border-border/80 rounded-xl py-2 px-3 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all text-xs font-medium text-foreground"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Engine Number</label>
                      <input
                        type="text"
                        placeholder="Engine stamp code"
                        value={ownershipEngine}
                        onChange={(e) => setOwnershipEngine(e.target.value)}
                        className="w-full bg-muted/40 border border-border/80 rounded-xl py-2 px-3 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all text-xs font-medium text-foreground"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={savingOwnership}
                    className="w-full bg-primary text-primary-foreground py-2.5 rounded-xl font-bold hover:opacity-95 transition-all text-xs shadow-md mt-2 flex items-center justify-center gap-1 active:scale-98 disabled:opacity-70"
                  >
                    {savingOwnership ? 'Saving...' : 'Save Ownership Details'}
                  </button>
                </form>
              )}

              {/* DOCUMENT VAULT TAB */}
              {vehicleDetailsTab === 'vault' && (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground leading-relaxed italic">
                    Store and lock copies of your vehicle documents securely. Files are automatically sync\'d to the Cloud.
                  </p>

                  <div className="space-y-3">
                    {[
                      { key: 'reg_book_url', name: 'Registration Book' },
                      { key: 'insurance_url', name: 'Insurance Certificate' },
                      { key: 'license_url', name: 'Driving License' },
                      { key: 'photos_url', name: 'Vehicle Photos' },
                      { key: 'service_records_url', name: 'Service & Maintenance Records' }
                    ].map((docItem) => {
                      const url = (selectedVehicleDetails as any)[docItem.key];
                      const isUploading = uploadingDocType === docItem.key;
                      
                      return (
                        <div key={docItem.key} className="p-4 bg-muted/20 border border-border rounded-xl flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${url ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground'}`}>
                              <FileText size={16} />
                            </div>
                            <div>
                              <span className="text-xs font-bold block text-foreground">{docItem.name}</span>
                              {url ? (
                                <span className="text-[9px] text-emerald-500 font-semibold flex items-center gap-0.5 mt-0.5">
                                  <Check size={10} /> Saved Securely
                                </span>
                              ) : (
                                <span className="text-[9px] text-muted-foreground block mt-0.5">Not uploaded yet</span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                             {url && (
                               <>
                                 <button
                                   type="button"
                                   onClick={() => setViewerUrl(url)}
                                   className="p-1.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg transition-colors"
                                   title="View Document"
                                 >
                                   <ExternalLink size={14} />
                                 </button>
                                 <button
                                   onClick={() => handleRemoveDocument(selectedVehicleDetails.id, docItem.key as any)}
                                   className="p-1.5 bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-lg transition-colors"
                                   title="Delete Document"
                                 >
                                   <Trash2 size={14} />
                                 </button>
                               </>
                             )}

                             {!url && (
                               <div className="relative">
                                 <label className={`cursor-pointer inline-flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded-lg border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 transition-colors ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                                   <UploadCloud size={12} />
                                   <span>{isUploading ? 'Uploading...' : 'Upload'}</span>
                                   <input
                                     type="file"
                                     accept="image/*,application/pdf,video/mp4"
                                     className="hidden"
                                     disabled={isUploading}
                                     onChange={async (e) => {
                                       const file = e.target.files?.[0];
                                       if (file) {
                                         await handleUploadDocument(selectedVehicleDetails.id, docItem.key as any, file);
                                       }
                                     }}
                                   />
                                </label>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-border bg-muted/10 flex justify-end">
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-2 bg-muted hover:bg-muted/80 rounded-xl text-xs font-bold text-foreground transition-colors"
              >
                Close details
              </button>
            </div>
          </div>
        </div>
      )}

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

export default FuelTracking;

