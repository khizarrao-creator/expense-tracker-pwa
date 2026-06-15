import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Send, 
  Smartphone, 
  Loader2, 
  CheckCheck, 
  MessageSquare, 
  Clock, 
  CloudUpload, 
  UserPlus, 
  Activity, 
  WifiOff, 
  UserCheck, 
  Image as ImageIcon, 
  Video as VideoIcon, 
  MessageCircle,
  QrCode,
  LogOut,
  FolderOpen
} from 'lucide-react';
import { toast } from 'sonner';
import { 
  getWhatsAppStatus, 
  logoutWhatsApp, 
  initWhatsApp, 
  getWhatsAppContacts, 
  getWhatsAppMessages, 
  getWhatsAppStatuses, 
  syncWhatsAppStatus, 
  syncAllWhatsAppStatuses, 
  sendWhatsAppMessage, 
  type WhatsAppAccount, 
  type WhatsAppContact, 
  type WhatsAppMessage, 
  type WhatsAppStatus 
} from '../services/whatsappService';
import { addLoanParty, getLoanParties, type LoanParty } from '../db/queries';

const WhatsApp: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'chats' | 'statuses' | 'settings'>('chats');
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([
    { id: 'account1', name: 'Primary Account', status: 'disconnected', qrCodeUrl: null, hasCreds: false },
    { id: 'account2', name: 'Secondary Account', status: 'disconnected', qrCodeUrl: null, hasCreds: false },
    { id: 'account3', name: 'Work Account', status: 'disconnected', qrCodeUrl: null, hasCreds: false }
  ]);
  const [activeAccountId, setActiveAccountId] = useState<string>('account1');
  
  // Chats State
  const [contacts, setContacts] = useState<WhatsAppContact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContact, setSelectedContact] = useState<WhatsAppContact | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [ledgerParties, setLedgerParties] = useState<LoanParty[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Statuses State
  const [statuses, setStatuses] = useState<WhatsAppStatus[]>([]);
  const [loadingStatuses, setLoadingStatuses] = useState(false);
  const [syncingStatus, setSyncingStatus] = useState<string | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [cloudinaryEnabled, setCloudinaryEnabled] = useState<boolean>(() => localStorage.getItem('whatsapp_cloudinary_enabled') === 'true');

  const toggleCloudinary = (val: boolean) => {
    setCloudinaryEnabled(val);
    localStorage.setItem('whatsapp_cloudinary_enabled', String(val));
    if (val) {
      toast.success('Cloudinary storage integration enabled.');
    } else {
      toast.info('Cloudinary storage integration disabled.');
    }
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeAccount = accounts.find(acc => acc.id === activeAccountId) || accounts[0];

  // Load accounts and initial settings
  const fetchAccounts = async () => {
    const res = await getWhatsAppStatus();
    if (res && res.accounts) {
      setAccounts(res.accounts);
    }
  };

  const fetchLedgerParties = async () => {
    try {
      const parties = await getLoanParties();
      setLedgerParties(parties);
    } catch (e) {
      console.error('Failed to fetch ledger parties', e);
    }
  };

  useEffect(() => {
    fetchAccounts();
    fetchLedgerParties();
    
    // Setup SSE listener
    const eventSource = new EventSource('/whatsapp-api/events');
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event === 'connection-update') {
          const { accountId, status, qrCodeUrl } = data.data;
          setAccounts(prev => prev.map(acc => 
            acc.id === accountId ? { ...acc, status, qrCodeUrl } : acc
          ));
          if (accountId === activeAccountId) {
            toast.info(`Account status updated: ${status}`);
          }
        } else if (data.event === 'new-message') {
          const { accountId, jid, message } = data.data;
          if (accountId === activeAccountId) {
            // If it belongs to currently selected contact, append it
            if (selectedContact && selectedContact.jid === jid) {
              setMessages(prev => {
                if (prev.find(m => m.id === message.id)) return prev;
                return [...prev, message];
              });
            }
            // Trigger contact list reload to show any new contacts/chats
            fetchContacts();
          }
        } else if (data.event === 'new-status') {
          const { accountId, filename, contactName, contactNumber, mediaType, timestamp } = data.data;
          if (accountId === activeAccountId) {
            setStatuses(prev => {
              if (prev.find(s => s.filename === filename)) return prev;
              const newStatus: WhatsAppStatus = {
                filename,
                contactName,
                contactNumber,
                timestamp,
                mediaType,
                cloudinaryUrl: null
              };
              return [newStatus, ...prev];
            });
            toast.success(`Downloaded new status from ${contactName}`);
          }
        }
      } catch (e) {
        console.error('Failed to parse SSE event', e);
      }
    };

    return () => {
      eventSource.close();
    };
  }, [activeAccountId, selectedContact]);

  // Load contacts when active account changes or connects
  const fetchContacts = async () => {
    if (activeAccount.status !== 'connected') {
      setContacts([]);
      return;
    }
    setLoadingContacts(true);
    const list = await getWhatsAppContacts(activeAccountId);
    setContacts(list);
    setLoadingContacts(false);
  };

  useEffect(() => {
    fetchContacts();
    setSelectedContact(null);
    setMessages([]);
    
    if (activeTab === 'statuses') {
      fetchStatuses();
    }
  }, [activeAccountId, activeAccount.status]);

  // Load messages when contact is selected
  useEffect(() => {
    if (!selectedContact) {
      setMessages([]);
      return;
    }

    const fetchMessages = async () => {
      setLoadingMessages(true);
      const history = await getWhatsAppMessages(activeAccountId, selectedContact.jid);
      setMessages(history);
      setLoadingMessages(false);
    };

    fetchMessages();
  }, [selectedContact, activeAccountId]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load statuses
  const fetchStatuses = async () => {
    if (activeAccount.status !== 'connected') {
      setStatuses([]);
      return;
    }
    setLoadingStatuses(true);
    const list = await getWhatsAppStatuses(activeAccountId);
    // Sort by timestamp desc
    const sorted = [...list].sort((a, b) => b.timestamp - a.timestamp);
    setStatuses(sorted);
    setLoadingStatuses(false);
  };

  useEffect(() => {
    if (activeTab === 'statuses') {
      fetchStatuses();
    }
  }, [activeTab, activeAccountId]);

  // Handle send message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedContact || isSending) return;

    setIsSending(true);
    const textToSend = newMessage.trim();
    setNewMessage('');

    // Optimistic local update
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: WhatsAppMessage = {
      id: tempId,
      fromMe: true,
      text: textToSend,
      timestamp: Date.now(),
      senderName: 'Me'
    };
    setMessages(prev => [...prev, optimisticMsg]);

    const res = await sendWhatsAppMessage(activeAccountId, selectedContact.phone, textToSend);
    if (!res.success) {
      toast.error(res.error || 'Failed to send message');
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m.id !== tempId));
    }
    setIsSending(false);
  };

  // Import contact to Ledger
  const handleImportContact = async (contact: WhatsAppContact) => {
    try {
      // Clean phone number (just digits)
      const cleanPhone = contact.phone;
      
      // Check if already exists in local list
      const exists = ledgerParties.some(p => p.phone?.replace(/\D/g, '') === cleanPhone);
      if (exists) {
        toast.info(`${contact.name} is already in your ledger.`);
        return;
      }

      await addLoanParty(contact.name, cleanPhone, null, 'Imported from WhatsApp');
      toast.success(`Successfully imported ${contact.name} to ledger!`);
      fetchLedgerParties();
    } catch (err: any) {
      toast.error(`Import failed: ${err.message}`);
    }
  };

  // Sync specific status to Cloudinary
  const handleSyncStatus = async (status: WhatsAppStatus) => {
    setSyncingStatus(status.filename);
    const updated = await syncWhatsAppStatus(activeAccountId, status.filename);
    if (updated && updated.cloudinaryUrl) {
      setStatuses(prev => prev.map(s => 
        s.filename === status.filename ? { ...s, cloudinaryUrl: updated.cloudinaryUrl } : s
      ));
      toast.success('Successfully uploaded status to Cloudinary!');
    } else {
      toast.error('Failed to sync status to cloud.');
    }
    setSyncingStatus(null);
  };

  // Sync all statuses
  const handleSyncAllStatuses = async () => {
    const unsyncedCount = statuses.filter(s => !s.cloudinaryUrl).length;
    if (unsyncedCount === 0) {
      toast.info('All statuses are already synced.');
      return;
    }

    setIsSyncingAll(true);
    const promise = syncAllWhatsAppStatuses(activeAccountId);
    
    toast.promise(promise, {
      loading: `Syncing ${unsyncedCount} statuses to Cloudinary...`,
      success: (syncedItems) => {
        setIsSyncingAll(false);
        fetchStatuses();
        return `Successfully synced ${syncedItems.length} statuses!`;
      },
      error: () => {
        setIsSyncingAll(false);
        return 'Failed during batch sync.';
      }
    });
  };

  // Initialize account link
  const handleConnect = async (accountId: string) => {
    toast.loading('Initializing connection session...', { id: 'whatsapp-init' });
    const success = await initWhatsApp(accountId);
    if (success) {
      toast.success('Session started. Please scan the QR code to link.', { id: 'whatsapp-init' });
      fetchAccounts();
    } else {
      toast.error('Failed to initialize session.', { id: 'whatsapp-init' });
    }
  };

  // Log out account
  const handleLogout = async (accountId: string) => {
    if (!confirm('Are you sure you want to disconnect and clear credentials for this account?')) return;
    
    toast.loading('Logging out...', { id: 'whatsapp-logout' });
    const success = await logoutWhatsApp(accountId);
    if (success) {
      toast.success('Disconnected successfully.', { id: 'whatsapp-logout' });
      fetchAccounts();
      if (accountId === activeAccountId) {
        setContacts([]);
        setSelectedContact(null);
        setMessages([]);
        setStatuses([]);
      }
    } else {
      toast.error('Logout failed.', { id: 'whatsapp-logout' });
    }
  };

  // Filter contacts
  const filteredContacts = contacts.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.phone.includes(searchQuery)
  );

  // Parse Date/Time from metadata or filename
  const formatStatusTime = (status: WhatsAppStatus) => {
    if (status.timestamp) {
      return new Date(status.timestamp).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    // Fallback parser from filename: 2026-06-15_18-55-15_John_92300.jpg
    const parts = status.filename.split('_');
    if (parts.length >= 2) {
      const date = parts[0];
      const time = parts[1].replace(/-/g, ':');
      return `${date} ${time}`;
    }
    return 'Unknown Time';
  };

  return (
    <div className="flex flex-col h-[calc(100vh-130px)] md:h-[calc(100vh-80px)] max-w-7xl mx-auto bg-background rounded-3xl border border-border overflow-hidden shadow-xl animate-in fade-in duration-300">
      
      {/* Top Header / Account Switcher & Tab Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-border bg-card/40 p-4 md:px-6 gap-4">
        
        {/* Switcher */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 text-emerald-500 rounded-2xl">
            <MessageCircle size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base leading-tight">WhatsApp Copilot</h1>
              <div className={`h-2 w-2 rounded-full ${
                activeAccount.status === 'connected' ? 'bg-emerald-500 animate-pulse' :
                activeAccount.status === 'qr' ? 'bg-amber-500 animate-pulse' :
                activeAccount.status === 'connecting' ? 'bg-indigo-500 animate-pulse' :
                'bg-muted-foreground/30'
              }`} />
            </div>
            
            <div className="flex items-center gap-1.5 mt-1">
              <select 
                value={activeAccountId} 
                onChange={(e) => setActiveAccountId(e.target.value)}
                className="bg-transparent text-xs font-semibold text-muted-foreground hover:text-foreground focus:outline-none cursor-pointer pr-1"
              >
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id} className="bg-card text-foreground font-medium text-xs">
                    {acc.name} ({acc.status === 'connected' ? 'Connected' : acc.status === 'qr' ? 'Action Req.' : 'Offline'})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex bg-muted/60 p-1 rounded-2xl w-fit self-start md:self-center">
          <button 
            onClick={() => setActiveTab('chats')}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'chats' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Chats
          </button>
          <button 
            onClick={() => setActiveTab('statuses')}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'statuses' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Statuses
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'settings' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Settings
          </button>
        </div>
      </div>

      {/* Main Workspace Body */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* CHATS TAB */}
        {activeTab === 'chats' && (
          <div className="flex flex-1 overflow-hidden divide-x divide-border">
            
            {/* Sidebar Pane (Contacts list) */}
            <div className="w-full md:w-80 flex flex-col flex-shrink-0 bg-card/25 overflow-hidden">
              
              {/* Search */}
              <div className="p-4 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 text-muted-foreground" size={16} />
                  <input
                    type="text"
                    placeholder="Search WhatsApp contacts..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-muted/40 border border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/20 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none transition-all"
                  />
                </div>
              </div>

              {/* Contacts List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {loadingContacts ? (
                  <div className="flex flex-col items-center justify-center h-48 gap-2">
                    <Loader2 className="animate-spin text-muted-foreground" size={20} />
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Loading contacts...</span>
                  </div>
                ) : activeAccount.status !== 'connected' ? (
                  <div className="flex flex-col items-center justify-center p-6 text-center h-full space-y-3">
                    <div className="p-3 bg-muted rounded-full text-muted-foreground">
                      <WifiOff size={24} />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs">Account Offline</h4>
                      <p className="text-[10px] text-muted-foreground leading-relaxed mt-1">
                        Please go to the <b>Settings</b> tab to initialize and scan the QR code to load contacts.
                      </p>
                    </div>
                  </div>
                ) : filteredContacts.length === 0 ? (
                  <div className="text-center py-12 text-xs text-muted-foreground uppercase font-bold tracking-wider">
                    No contacts found
                  </div>
                ) : (
                  filteredContacts.map(contact => {
                    const isLedgerContact = ledgerParties.some(p => p.phone?.replace(/\D/g, '') === contact.phone);
                    
                    return (
                      <div 
                        key={contact.jid}
                        onClick={() => setSelectedContact(contact)}
                        className={`flex items-center justify-between p-3 rounded-2xl cursor-pointer transition-all ${
                          selectedContact?.jid === contact.jid 
                            ? 'bg-emerald-500/10 text-foreground border border-emerald-500/20' 
                            : 'hover:bg-muted/50 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="h-9 w-9 rounded-full bg-emerald-500/10 text-emerald-500 font-bold flex items-center justify-center text-xs flex-shrink-0">
                            {contact.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="overflow-hidden">
                            <h4 className="font-bold text-xs truncate leading-snug">{contact.name}</h4>
                            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{contact.phone}</p>
                          </div>
                        </div>

                        {/* Import/Ledger badge */}
                        <div onClick={(e) => e.stopPropagation()} className="flex-shrink-0 ml-2">
                          {isLedgerContact ? (
                            <span className="text-[8px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold px-2 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-0.5 select-none">
                              <UserCheck size={9} /> Ledger
                            </span>
                          ) : (
                            <button
                              onClick={() => handleImportContact(contact)}
                              className="text-[8px] bg-primary text-primary-foreground font-bold px-2 py-0.5 rounded-full hover:opacity-90 active:scale-95 transition-all flex items-center gap-0.5"
                              title="Import to Ledger System"
                            >
                              <UserPlus size={9} /> Import
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Message Pane */}
            <div className={`flex-1 flex flex-col overflow-hidden bg-muted/10 ${
              !selectedContact ? 'hidden md:flex' : 'flex'
            }`}>
              {selectedContact ? (
                <>
                  {/* Chat Header */}
                  <div className="flex items-center justify-between p-4 border-b border-border bg-card/20">
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => setSelectedContact(null)}
                        className="md:hidden p-1 text-muted-foreground hover:text-foreground"
                      >
                        ← Back
                      </button>
                      <div className="h-9 w-9 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs">
                        {selectedContact.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-bold text-xs leading-none">{selectedContact.name}</h3>
                        <span className="text-[9px] text-muted-foreground font-semibold mt-1 inline-block">
                          {selectedContact.phone}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] bg-card text-muted-foreground border border-border px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                        Active Account: {activeAccount.name}
                      </span>
                    </div>
                  </div>

                  {/* Messages Area */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
                    {loadingMessages ? (
                      <div className="flex flex-col items-center justify-center h-full gap-2">
                        <Loader2 className="animate-spin text-muted-foreground" size={24} />
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Loading history...</span>
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full p-6 text-center text-muted-foreground gap-2">
                        <MessageSquare size={36} className="opacity-20" />
                        <p className="text-[10px] uppercase font-bold tracking-wider">No message history available</p>
                        <p className="text-[9px] max-w-xs leading-relaxed">
                          Your messages are not stored long-term in the ledger. Send a message to start a conversation log.
                        </p>
                      </div>
                    ) : (
                      messages.map(msg => (
                        <div 
                          key={msg.id}
                          className={`flex flex-col max-w-[75%] ${
                            msg.fromMe ? 'ml-auto items-end' : 'mr-auto items-start'
                          }`}
                        >
                          <div className={`p-3 rounded-2xl text-xs leading-relaxed shadow-sm ${
                            msg.fromMe 
                              ? 'bg-emerald-500 text-white rounded-tr-none' 
                              : 'bg-card text-foreground border border-border rounded-tl-none'
                          }`}>
                            <p className="whitespace-pre-wrap font-medium">{msg.text}</p>
                          </div>
                          
                          <div className="flex items-center gap-1 mt-1 text-[8px] font-bold text-muted-foreground uppercase tracking-wider px-1">
                            <span>{new Date(msg.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                            {msg.fromMe && (
                              <CheckCheck size={10} className="text-emerald-500" />
                            )}
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Send Input Footer */}
                  <form onSubmit={handleSendMessage} className="p-4 border-t border-border bg-card/25">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Type WhatsApp message..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        disabled={isSending}
                        className="flex-1 bg-background border border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/20 rounded-xl px-4 py-2.5 text-xs focus:outline-none transition-all disabled:opacity-50"
                      />
                      <button
                        type="submit"
                        disabled={!newMessage.trim() || isSending}
                        className="p-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:hover:bg-emerald-500 text-white rounded-xl active:scale-95 transition-all flex items-center justify-center flex-shrink-0"
                      >
                        {isSending ? (
                          <Loader2 className="animate-spin" size={16} />
                        ) : (
                          <Send size={16} />
                        )}
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
                  <div className="p-4 bg-emerald-500/10 text-emerald-500 rounded-3xl animate-bounce duration-1000">
                    <MessageSquare size={36} />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm">Select a Conversation</h3>
                    <p className="text-xs text-muted-foreground max-w-xs mt-1 leading-relaxed">
                      Pick a contact from the sidebar to view chat history and write messages.
                    </p>
                  </div>
                </div>
              )}
            </div>
            
          </div>
        )}

        {/* STATUSES TAB */}
        {activeTab === 'statuses' && (
          <div className="flex-1 flex flex-col overflow-hidden p-6 space-y-6">
            
            {/* Tab Actions Header */}
            <div className="flex items-center justify-between flex-wrap gap-4 border-b border-border/60 pb-4">
              <div>
                <h2 className="text-base font-bold">Downloaded WhatsApp Statuses</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  View statuses automatically downloaded from your contacts. Optionally sync them to your cloud (Cloudinary).
                </p>
              </div>

              <div className="flex items-center gap-3">
                {/* Cloudinary Toggle Switch */}
                <div className="flex items-center gap-2 bg-card border border-border px-3 py-1.5 rounded-xl text-xs font-semibold select-none shadow-sm">
                  <span className="text-muted-foreground text-[10px] uppercase tracking-wider font-bold">Cloud Sync</span>
                  <button 
                    onClick={() => toggleCloudinary(!cloudinaryEnabled)}
                    type="button"
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                      cloudinaryEnabled ? 'bg-emerald-500' : 'bg-muted-foreground/30'
                    }`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                      cloudinaryEnabled ? 'translate-x-4.5' : 'translate-x-1'
                    }`} />
                  </button>
                </div>

                {cloudinaryEnabled && activeAccount.status === 'connected' && statuses.length > 0 && (
                  <button
                    onClick={handleSyncAllStatuses}
                    disabled={isSyncingAll || statuses.every(s => s.cloudinaryUrl)}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    {isSyncingAll ? (
                      <Loader2 className="animate-spin" size={14} />
                    ) : (
                      <CloudUpload size={14} />
                    )}
                    Sync All to Cloud
                  </button>
                )}
              </div>
            </div>

            {/* Statuses Grid */}
            <div className="flex-1 overflow-y-auto">
              {loadingStatuses ? (
                <div className="flex flex-col items-center justify-center h-64 gap-2">
                  <Loader2 className="animate-spin text-muted-foreground" size={24} />
                  <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Loading downloaded statuses...</span>
                </div>
              ) : activeAccount.status !== 'connected' ? (
                <div className="flex flex-col items-center justify-center p-12 text-center h-64 space-y-3">
                  <div className="p-3 bg-muted rounded-full text-muted-foreground">
                    <WifiOff size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs">Account Offline</h4>
                    <p className="text-[10px] text-muted-foreground leading-relaxed mt-1">
                      Link your account on the <b>Settings</b> tab to scan and display incoming statuses.
                    </p>
                  </div>
                </div>
              ) : statuses.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground gap-3">
                  <ImageIcon size={40} className="opacity-20" />
                  <div>
                    <h4 className="font-bold text-xs">No Statuses Yet</h4>
                    <p className="text-[10px] text-muted-foreground max-w-xs mt-1 leading-relaxed">
                      As soon as your contacts post updates, they will download here automatically. Keep this bridge running!
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-6">
                  {statuses.map(status => {
                    const localUrl = `/whatsapp-api/local-media/${activeAccountId}/${status.filename}`;
                    const displayUrl = status.cloudinaryUrl || localUrl;

                    return (
                      <div 
                        key={status.filename}
                        className="bg-card rounded-2xl border border-border overflow-hidden hover:shadow-md transition-all flex flex-col group"
                      >
                        {/* Media Container */}
                        <div className="relative aspect-[9/16] bg-black flex items-center justify-center overflow-hidden">
                          {status.mediaType === 'image' ? (
                            <img 
                              src={displayUrl} 
                              alt={`Status from ${status.contactName}`}
                              className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
                              loading="lazy"
                            />
                          ) : (
                            <video 
                              src={displayUrl} 
                              controls
                              className="w-full h-full object-cover"
                              preload="metadata"
                            />
                          )}

                          {/* Top Overlays */}
                          <div className="absolute top-2 left-2 right-2 flex justify-between items-start">
                            {(cloudinaryEnabled || status.cloudinaryUrl) && (
                              <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full backdrop-blur-md text-white border flex items-center gap-1 ${
                                status.cloudinaryUrl 
                                  ? 'bg-emerald-500/80 border-emerald-500/20' 
                                  : 'bg-black/60 border-white/10'
                              }`}>
                                {status.cloudinaryUrl ? 'Synced to Cloud' : 'Local Only'}
                              </span>
                            )}
                            
                            <span className="p-1 bg-black/60 backdrop-blur-md rounded-lg text-white border border-white/10">
                              {status.mediaType === 'image' ? (
                                <ImageIcon size={10} />
                              ) : (
                                <VideoIcon size={10} />
                              )}
                            </span>
                          </div>
                        </div>

                        {/* Details Footer */}
                        <div className="p-3 bg-card flex-1 flex flex-col justify-between border-t border-border/40">
                          <div>
                            <div className="flex items-center justify-between gap-1 overflow-hidden">
                              <h4 className="font-bold text-xs truncate leading-snug">{status.contactName}</h4>
                            </div>
                            <p className="text-[9px] text-muted-foreground truncate">{status.contactNumber}</p>
                            
                            <div className="flex items-center gap-1 text-[8px] text-muted-foreground/80 font-bold uppercase tracking-wider mt-2">
                              <Clock size={10} />
                              <span>{formatStatusTime(status)}</span>
                            </div>
                          </div>

                          {/* Sync Control */}
                          {cloudinaryEnabled ? (
                            !status.cloudinaryUrl ? (
                              <button
                                onClick={() => handleSyncStatus(status)}
                                disabled={syncingStatus === status.filename}
                                className="w-full mt-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 hover:border-primary/30 font-bold text-[9px] rounded-lg transition-all flex items-center justify-center gap-1"
                              >
                                {syncingStatus === status.filename ? (
                                  <>
                                    <Loader2 className="animate-spin" size={10} />
                                    Uploading...
                                  </>
                                ) : (
                                  <>
                                    <CloudUpload size={10} />
                                    Sync to Cloud
                                  </>
                                )}
                              </button>
                            ) : (
                              <a 
                                href={status.cloudinaryUrl} 
                                target="_blank" 
                                rel="noreferrer"
                                className="w-full mt-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:border-emerald-500/30 font-bold text-[9px] rounded-lg transition-all flex items-center justify-center gap-1"
                              >
                                <FolderOpen size={10} />
                                Open Cloud Url
                              </a>
                            )
                          ) : (
                            status.cloudinaryUrl && (
                              <a 
                                href={status.cloudinaryUrl} 
                                target="_blank" 
                                rel="noreferrer"
                                className="w-full mt-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:border-emerald-500/30 font-bold text-[9px] rounded-lg transition-all flex items-center justify-center gap-1"
                              >
                                <FolderOpen size={10} />
                                Open Cloud Url
                              </a>
                            )
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* Header info */}
            <div>
              <h2 className="text-base font-bold">WhatsApp Account Management</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Link and manage up to three concurrent WhatsApp accounts. Clear authorization details or initialize QR codes to pair new devices.
              </p>
            </div>

            {/* Accounts List Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {accounts.map(acc => {
                const isSelected = acc.id === activeAccountId;
                
                return (
                  <div 
                    key={acc.id}
                    className={`bg-card rounded-3xl border p-5 flex flex-col justify-between gap-5 transition-all ${
                      isSelected 
                        ? 'border-emerald-500/60 shadow-md ring-1 ring-emerald-500/20' 
                        : 'border-border'
                    }`}
                  >
                    <div>
                      {/* Top Row */}
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-xl border ${
                            acc.status === 'connected' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                            acc.status === 'qr' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                            'bg-muted text-muted-foreground border-border'
                          }`}>
                            <Smartphone size={20} />
                          </div>
                          <div>
                            <h3 className="font-bold text-xs">{acc.name}</h3>
                            <span className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider">{acc.id}</span>
                          </div>
                        </div>

                        {/* Switch Account Active Link Indicator */}
                        {isSelected && (
                          <span className="text-[8px] bg-emerald-500 text-white font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5 uppercase tracking-wide shadow-sm">
                            <Activity size={9} /> Active
                          </span>
                        )}
                      </div>

                      {/* Connection status display */}
                      <div className="mt-4 p-3 bg-muted/40 border border-border/60 rounded-2xl flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground font-semibold">Connection Status:</span>
                        <span className={`text-[10px] font-bold uppercase tracking-wide ${
                          acc.status === 'connected' ? 'text-emerald-500' :
                          acc.status === 'qr' ? 'text-amber-500' :
                          acc.status === 'connecting' ? 'text-indigo-500' :
                          'text-muted-foreground/60'
                        }`}>
                          {acc.status}
                        </span>
                      </div>

                      {/* QR Display container */}
                      {acc.status === 'qr' && acc.qrCodeUrl && (
                        <div className="mt-5 flex flex-col items-center gap-3 border border-dashed border-amber-500/30 bg-amber-500/[0.02] p-4 rounded-2xl">
                          <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider text-center">
                            Scan with your phone WhatsApp Linked Devices
                          </span>
                          <div className="relative p-2 bg-white rounded-xl shadow-md flex items-center justify-center border border-border">
                            <img 
                              src={acc.qrCodeUrl} 
                              alt="Scan QR code to pair"
                              className="h-32 w-32 object-contain"
                            />
                            {/* Scanning beam animation */}
                            <div className="absolute inset-x-2 top-2 h-0.5 bg-emerald-500 opacity-60 animate-bounce duration-3000" />
                          </div>
                          <span className="text-[8px] text-muted-foreground text-center max-w-[150px] leading-relaxed">
                            Code refreshes automatically. Link active within 60s.
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Controls */}
                    <div className="flex gap-2 border-t border-border/40 pt-4 mt-2">
                      {acc.status === 'disconnected' ? (
                        <button
                          onClick={() => handleConnect(acc.id)}
                          className="flex-1 py-2 bg-primary hover:opacity-90 active:scale-98 text-primary-foreground font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm"
                        >
                          <QrCode size={13} />
                          Link Device
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => handleLogout(acc.id)}
                            className="flex-1 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 hover:border-rose-500/30 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5"
                          >
                            <LogOut size={13} />
                            Log Out
                          </button>
                          
                          {acc.status === 'qr' && (
                            <button
                              onClick={() => handleConnect(acc.id)}
                              className="py-2 px-3 bg-muted hover:bg-muted-foreground/10 text-foreground font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5"
                              title="Regenerate QR Code"
                            >
                              Retry
                            </button>
                          )}
                        </>
                      )}

                      {!isSelected && acc.status === 'connected' && (
                        <button
                          onClick={() => setActiveAccountId(acc.id)}
                          className="py-2 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:border-emerald-500/30 font-bold text-xs rounded-xl transition-all flex items-center justify-center"
                        >
                          Switch
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Cloudinary credentials warning display */}
            <div className="bg-card rounded-2xl border border-border p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-indigo-500/10 text-indigo-500 rounded-xl mt-0.5 md:mt-0 flex-shrink-0">
                  <CloudUpload size={18} />
                </div>
                <div>
                  <h4 className="font-bold text-xs">Cloudinary Storage Integration</h4>
                  <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">
                    Images and videos synced to cloud are uploaded to your Cloudinary storage folder. Credentials are automatically read from the backend system environment variables.
                  </p>
                </div>
              </div>

              {/* Cloudinary Toggle Switch */}
              <div className="flex items-center gap-2.5 bg-muted/40 border border-border/85 px-4 py-2 rounded-2xl text-xs font-semibold select-none flex-shrink-0 self-start md:self-center">
                <span className="text-muted-foreground text-[10px] uppercase tracking-wider font-bold">Enable Cloud Integration</span>
                <button 
                  onClick={() => toggleCloudinary(!cloudinaryEnabled)}
                  type="button"
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                    cloudinaryEnabled ? 'bg-emerald-500' : 'bg-muted-foreground/30'
                  }`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    cloudinaryEnabled ? 'translate-x-4.5' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
};

export default WhatsApp;
