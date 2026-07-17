import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Sparkles, Send, X, Mic, MicOff, Paperclip, Loader2,
  Bot, AlertTriangle, Trash2, RefreshCw, ChevronDown, Minimize2
} from 'lucide-react';
import { useCurrency } from '../contexts/CurrencyContext';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

import { getCachedSnapshot, invalidateAICache, type FinancialSnapshot } from '../services/aiDataService';
import {
  loadSession, saveMessage, clearSession, sendToGeminiStream,
  type ChatMessage
} from '../services/aiChatService';
import { getModelRegistry, getModelById, getApiKey } from '../services/ai';
import { uploadToCloudinary } from '../services/cloudinaryService';
import {
  getWhatsAppStatus,
  initWhatsApp,
  logoutWhatsApp,
  getWhatsAppContacts,
  getWhatsAppMessages,
  sendWhatsAppMessage,
  deleteWhatsAppMessage
} from '../services/whatsappService';
import {
  addTransaction,
  updateTransaction,
  deleteTransaction,
  getTransactions,
  addLoan,
  updateLoan,
  deleteLoan,
  getLoans,
  addLoanParty,
  updateLoanParty,
  deleteLoanParty,
  getLoanParties,
  addCategory,
  updateCategory,
  deleteCategory,
  getCategories,
  getAccounts,
  logAiAgentAction
} from '../db/queries';

const SESSION_STORAGE_KEY = 'ledger_ai_session_id';

// ─── Markdown Renderer (Inline/Compact) ───────────────────────────────────────
const CompactMarkdown: React.FC<{ content: string }> = ({ content }) => {
  const html = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/```[\w]*\n?([\s\S]*?)```/g, '<pre class="bg-muted/70 border border-border p-2 rounded-lg text-[10px] font-mono overflow-x-auto my-1">$1</pre>')
    .replace(/`([^`]+)`/g, '<code class="bg-muted px-1 rounded text-[10px] font-mono">$1</code>')
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
    .replace(/^### (.*$)/gm, '<h4 class="text-xs font-bold mt-2 mb-0.5">$1</h4>')
    .replace(/^## (.*$)/gm, '<h3 class="text-xs font-black mt-3 mb-1">$1</h3>')
    .replace(/^\s*[-•]\s+(.*$)/gm, '<li class="flex gap-1.5 my-0.5"><span class="text-primary text-xs shrink-0">•</span><span class="text-xs">$1</span></li>')
    .replace(/\n/g, '<br />');

  return (
    <div
      className="text-xs leading-relaxed space-y-0.5"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

// ─── Message Item ───────────────────────────────────────────────────────────
const MessageItem: React.FC<{ msg: ChatMessage }> = ({ msg }) => {
  const [isThoughtExpanded, setIsThoughtExpanded] = useState(false);

  if (msg.functionCall) {
    return (
      <div className="flex justify-start pl-8 my-0.5 w-full">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground bg-muted/20 border border-border/50 rounded-lg px-2 py-1">
          <Loader2 size={10} className="text-primary animate-spin" />
          <span>Tool: <code className="font-mono text-primary bg-primary/5 px-1 rounded">{msg.functionCall.name}</code></span>
        </div>
      </div>
    );
  }

  if (msg.functionResponse) {
    const isSuccess = msg.functionResponse.response?.success !== false;
    return (
      <div className="flex justify-start pl-8 my-0.5 w-full">
        <div className={`flex items-center gap-1.5 text-[10px] font-semibold rounded-lg px-2 py-1 border ${isSuccess
          ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          : 'bg-destructive/5 border-destructive/10 text-destructive'
          }`}>
          <span>{isSuccess ? '✓' : '⚠️'}</span>
          <span>{isSuccess ? 'Success' : 'Failed'}</span>
        </div>
      </div>
    );
  }

  const isUser = msg.role === 'user';
  return (
    <div className={`flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in duration-200`}>
      {!isUser && (
        <div className="shrink-0 w-6 h-6 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
          <Bot size={12} />
        </div>
      )}

      <div className={`max-w-[85%] rounded-xl px-3 py-2 shadow-sm border ${isUser
        ? 'bg-primary text-primary-foreground border-primary/30 rounded-br-none'
        : 'bg-card text-foreground border-border rounded-bl-none'
        }`}>
        {msg.imageUrl && (
          <div className="mb-1.5 max-w-full overflow-hidden rounded-lg border border-border/30 bg-muted/20">
            <img src={msg.imageUrl} alt="Receipt attachment" className="max-h-40 w-auto object-contain rounded-md" />
          </div>
        )}
        {!isUser && msg.thought && (
          <div className="mb-2 border-l-2 border-primary/30 pl-2 text-[10px] text-muted-foreground bg-muted/10 rounded p-1.5 border border-border/30">
            <button
              type="button"
              onClick={() => setIsThoughtExpanded(!isThoughtExpanded)}
              className="flex items-center gap-1 font-bold hover:text-foreground transition-colors py-0.5"
            >
              <Bot size={10} className={isThoughtExpanded ? "text-primary" : "text-muted-foreground animate-pulse"} />
              <span>{isThoughtExpanded ? 'Hide thinking process' : 'View thinking process'}</span>
              <ChevronDown size={10} className={`transform transition-transform duration-200 ${isThoughtExpanded ? 'rotate-180' : ''}`} />
            </button>
            {isThoughtExpanded && (
              <div className="mt-1 font-mono text-[9px] leading-normal whitespace-pre-wrap max-h-36 overflow-y-auto border-t border-border/25 pt-1 text-muted-foreground/90">
                {msg.thought}
              </div>
            )}
          </div>
        )}
        {isUser ? (
          <p className="text-xs whitespace-pre-wrap">{msg.content}</p>
        ) : (
          <CompactMarkdown content={msg.content} />
        )}
      </div>
    </div>
  );
};

export const GlobalAIAssistant: React.FC = () => {
  const location = useLocation();
  const { currency: globalCurrency } = useCurrency();
  const { user } = useAuth();

  const apiKey = getApiKey() || undefined;

  // Toggle open state
  const [isOpen, setIsOpen] = useState(false);

  // Session
  const [sessionId, setSessionId] = useState<string>(() => {
    const saved = localStorage.getItem(SESSION_STORAGE_KEY);
    if (saved) return saved;
    const newId = uuidv4();
    localStorage.setItem(SESSION_STORAGE_KEY, newId);
    return newId;
  });

  // State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<FinancialSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(true);
  const [sessionLoading, setSessionLoading] = useState(true);

  // OCR attachment states
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [attachedImageBase64, setAttachedImageBase64] = useState<{ mimeType: string; data: string } | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // ── Voice Recording States ──────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Streaming state
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [streamingThought, setStreamingThought] = useState<string | null>(null);

  // Model selector state
  const models = getModelRegistry().filter(m => m.capabilities.includes('chat'));
  const [selectedModelId, setSelectedModelId] = useState<string>(() => {
    return localStorage.getItem('ai_preferred_model_id') || 'gemini-2.5-flash';
  });
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  const handleModelSelect = (modelId: string) => {
    setSelectedModelId(modelId);
    localStorage.setItem('ai_preferred_model_id', modelId);
    setShowModelDropdown(false);
    toast.success(`Switched to ${getModelById(modelId)?.name || modelId}`);
  };

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Manual approval modal state
  const [pendingApproval, setPendingApproval] = useState<{
    toolName: string;
    args: any;
    resolve: (approved: boolean) => void;
  } | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getApproveMode = (): 'auto' | 'manual' => {
    return (localStorage.getItem('ai_agent_approve_mode') as 'auto' | 'manual') || 'manual';
  };



  // ── Sync Session ID with localStorage ──────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const activeSession = localStorage.getItem(SESSION_STORAGE_KEY);
    if (activeSession && activeSession !== sessionId) {
      setSessionId(activeSession);
    }
  }, [isOpen, sessionId]);

  // Keep handleSend ref updated to avoid stale closures in effects
  const handleSendRef = useRef<any>(null);
  useEffect(() => {
    handleSendRef.current = handleSend;
  });

  // ── Voice Recording & Web Speech API ──────────────────────────────────────
  const startSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Speech recognition is not supported in this browser. Please use Chrome or Safari.');
      return;
    }

    try {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';

      rec.onstart = () => {
        setIsRecording(true);
        toast.info('Listening... Speak now.');
      };

      rec.onend = () => {
        setIsRecording(false);
        recognitionRef.current = null;
      };

      rec.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setInputValue(transcript);
          toast.success('Voice captured!');
          setTimeout(() => {
            if (handleSendRef.current) {
              handleSendRef.current(transcript);
            }
          }, 800);
        }
      };

      rec.onerror = (event: any) => {
        console.error('Speech Recognition Error Event:', event);
        setIsRecording(false);
        recognitionRef.current = null;

        if (event.error === 'not-allowed') {
          toast.error('Microphone permission denied. Please allow microphone access.');
        } else if (event.error === 'network') {
          toast.error('Speech recognition network error. Please check your internet connection or use Chrome.');
        } else {
          toast.error(`Speech recognition failed: ${event.error || 'unknown error'}`);
        }
      };

      recognitionRef.current = rec;
      rec.start();
    } catch (e: any) {
      console.error('Failed to start speech recognition:', e);
      setIsRecording(false);
      recognitionRef.current = null;
      toast.error('Failed to start speech recognition.');
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch { }
      }
      setIsRecording(false);
    } else {
      startSpeechRecognition();
    }
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { }
      }
    };
  }, []);

  // ── Load financial data ───────────────────────────────────────────────────
  const loadSnapshot = useCallback(async () => {
    setSnapshotLoading(true);
    try {
      const snap = await getCachedSnapshot();
      setSnapshot(snap);
    } catch (e) {
      console.error('[GlobalAI] Failed to load financial snapshot:', e);
    } finally {
      setSnapshotLoading(false);
    }
  }, []);

  const loadChatSession = useCallback(async () => {
    if (!user) return;
    setSessionLoading(true);
    try {
      const session = await loadSession(user.uid, sessionId);
      setMessages(session.messages);
    } catch (e) {
      console.warn('[GlobalAI] Could not load Firestore session:', e);
    } finally {
      setSessionLoading(false);
    }
  }, [user, sessionId]);

  useEffect(() => {
    if (isOpen) {
      loadSnapshot();
      loadChatSession();
    }
  }, [isOpen, loadSnapshot, loadChatSession]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, isOpen]);

  // ── File upload (OCR) handlers ────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file (PNG/JPG).');
      return;
    }
    setAttachedFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));

    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const parts = dataUrl.split(',');
      const mimeType = parts[0].split(';')[0].split(':')[1];
      const base64Data = parts[1];
      setAttachedImageBase64({ mimeType, data: base64Data });
    };
    reader.readAsDataURL(file);
  };

  const clearAttachment = () => {
    setAttachedFile(null);
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    setImagePreviewUrl(null);
    setAttachedImageBase64(null);
  };

  // ── Execute Local Database Query Tools ────────────────────────────────────
  const executeLocalTool = async (name: string, args: any): Promise<any> => {
    const isMutation = name.startsWith('update_') || name.startsWith('delete_');
    if (isMutation && getApproveMode() === 'manual') {
      const approved = await new Promise<boolean>((resolve) => {
        setPendingApproval({ toolName: name, args, resolve });
      });
      if (!approved) {
        return { success: false, error: 'Operation declined by user.' };
      }
    }

    switch (name) {
      case 'add_transaction': {
        const { type, amount, category, description, date, payment_method, account_name, to_account_name, subcategory, transfer_fee } = args;
        const allAccounts = await getAccounts();
        const fromAcc = allAccounts.find(a => a.name.trim().toLowerCase() === account_name.trim().toLowerCase());
        if (!fromAcc) {
          return { success: false, error: `Account "${account_name}" not found.` };
        }

        let toAccId: string | null = null;
        if (type === 'transfer' && to_account_name) {
          const toAcc = allAccounts.find(a => a.name.trim().toLowerCase() === to_account_name.trim().toLowerCase());
          if (!toAcc) return { success: false, error: `Destination account "${to_account_name}" not found.` };
          toAccId = toAcc.id;
        }

        const dateStr = date || new Date().toISOString().split('T')[0];
        const id = await addTransaction(
          type, parseFloat(amount), category, description || '', dateStr,
          payment_method || 'Debit Card', fromAcc.id, toAccId, subcategory || null,
          undefined, null, null, null, transfer_fee ? parseFloat(transfer_fee) : 0
        );

        invalidateAICache();
        await loadSnapshot();
        return { success: true, transaction_id: id, message: `Successfully recorded ${type} of ${amount} for ${category}.` };
      }

      case 'update_transaction': {
        const { id, updates } = args;
        const cleanUpdates: any = { ...updates };
        if (updates.account_name) {
          const allAccounts = await getAccounts();
          const fromAcc = allAccounts.find(a => a.name.trim().toLowerCase() === updates.account_name.trim().toLowerCase());
          if (!fromAcc) return { success: false, error: `Account "${updates.account_name}" not found.` };
          cleanUpdates.account_id = fromAcc.id;
          delete cleanUpdates.account_name;
        }
        if (updates.to_account_name) {
          const allAccounts = await getAccounts();
          const toAcc = allAccounts.find(a => a.name.trim().toLowerCase() === updates.to_account_name.trim().toLowerCase());
          if (!toAcc) return { success: false, error: `Destination account "${updates.to_account_name}" not found.` };
          cleanUpdates.to_account_id = toAcc.id;
          delete cleanUpdates.to_account_name;
        }
        await updateTransaction(id, cleanUpdates);
        invalidateAICache();
        await loadSnapshot();
        return { success: true, transaction_id: id, message: `Updated transaction ${id}.` };
      }

      case 'delete_transaction': {
        const { id } = args;
        await deleteTransaction(id);
        invalidateAICache();
        await loadSnapshot();
        return { success: true, message: `Deleted transaction ${id}.` };
      }

      case 'get_transactions': {
        const { limit, offset } = args;
        const results = await getTransactions(limit || 50, offset || 0);
        return { success: true, count: results.length, transactions: results };
      }

      case 'add_loan': {
        const { direction, party_name, amount, date, description, due_date, category, account_name } = args;
        const allParties = await getLoanParties();
        let party = allParties.find(p => p.name.trim().toLowerCase() === party_name.trim().toLowerCase());
        let partyId = party?.id;
        if (!partyId) {
          partyId = await addLoanParty(party_name, '', '', 'Created automatically by AI Agent');
        }

        let accId: string | null = null;
        if (account_name) {
          const allAccounts = await getAccounts();
          const acc = allAccounts.find(a => a.name.trim().toLowerCase() === account_name.trim().toLowerCase());
          if (acc) accId = acc.id;
        }

        const dateStr = date || new Date().toISOString().split('T')[0];
        const id = await addLoan(
          direction, partyId, parseFloat(amount), dateStr, description || '',
          due_date || null, category || 'Personal', 0, 'none', accId
        );

        invalidateAICache();
        await loadSnapshot();
        return { success: true, loan_id: id, message: `Recorded loan ${direction} to/from ${party_name} of ${amount}.` };
      }

      case 'update_loan': {
        const { id, updates } = args;
        const cleanUpdates: any = { ...updates };
        if (updates.party_name) {
          const allParties = await getLoanParties();
          const party = allParties.find(p => p.name.trim().toLowerCase() === updates.party_name.trim().toLowerCase());
          if (party) {
            cleanUpdates.party_id = party.id;
          } else {
            cleanUpdates.party_id = await addLoanParty(updates.party_name, '', '', 'Created automatically by AI Agent');
          }
          delete cleanUpdates.party_name;
        }
        if (updates.account_name) {
          const allAccounts = await getAccounts();
          const acc = allAccounts.find(a => a.name.trim().toLowerCase() === updates.account_name.trim().toLowerCase());
          if (acc) cleanUpdates.account_id = acc.id;
          delete cleanUpdates.account_name;
        }
        await updateLoan(id, cleanUpdates);
        invalidateAICache();
        await loadSnapshot();
        return { success: true, loan_id: id, message: `Updated loan ${id}.` };
      }

      case 'delete_loan': {
        const { id } = args;
        await deleteLoan(id);
        invalidateAICache();
        await loadSnapshot();
        return { success: true, message: `Deleted loan ${id}.` };
      }

      case 'get_loans': {
        const { direction, status } = args;
        const results = await getLoans({ direction, status });
        return { success: true, count: results.length, loans: results };
      }

      case 'add_loan_party': {
        const { name, phone, email, notes } = args;
        const id = await addLoanParty(name, phone || '', email || '', notes || '');
        invalidateAICache();
        await loadSnapshot();
        return { success: true, party_id: id, message: `Created counterparty ${name}.` };
      }

      case 'update_loan_party': {
        const { id, updates } = args;
        await updateLoanParty(id, updates);
        invalidateAICache();
        await loadSnapshot();
        return { success: true, party_id: id, message: `Updated counterparty ${id}.` };
      }

      case 'delete_loan_party': {
        const { id } = args;
        await deleteLoanParty(id);
        invalidateAICache();
        await loadSnapshot();
        return { success: true, message: `Deleted counterparty ${id}.` };
      }

      case 'get_loan_parties': {
        const results = await getLoanParties();
        return { success: true, count: results.length, parties: results };
      }

      case 'add_category': {
        const { name, type, icon, parent_name } = args;
        let parentId: string | null = null;
        if (parent_name) {
          const categories = await getCategories(type);
          const parent = categories.find(c => c.name.trim().toLowerCase() === parent_name.trim().toLowerCase());
          if (parent) parentId = parent.id;
        }
        const id = await addCategory(name, type, icon || '', parentId);
        invalidateAICache();
        await loadSnapshot();
        return { success: true, category_id: id, message: `Created category ${name}.` };
      }

      case 'update_category': {
        const { id, updates } = args;
        const cleanUpdates: any = { ...updates };
        if (updates.parent_name) {
          const categories = await getCategories('expense');
          const parent = categories.find(c => c.name.trim().toLowerCase() === updates.parent_name.trim().toLowerCase());
          if (parent) cleanUpdates.parent_id = parent.id;
          delete cleanUpdates.parent_name;
        }
        await updateCategory(id, cleanUpdates);
        invalidateAICache();
        await loadSnapshot();
        return { success: true, category_id: id, message: `Updated category ${id}.` };
      }

      case 'delete_category': {
        const { id } = args;
        await deleteCategory(id);
        invalidateAICache();
        await loadSnapshot();
        return { success: true, message: `Deleted category ${id}.` };
      }

      case 'get_categories': {
        const { type } = args;
        const catType = type === 'all' ? undefined : (type as 'income' | 'expense' | undefined);
        const results = await getCategories(catType, 'all');
        return { success: true, count: results.length, categories: results };
      }

      case 'get_whatsapp_status': {
        const result = await getWhatsAppStatus();
        return { success: true, accounts: result.accounts };
      }

      case 'init_whatsapp': {
        const { accountId } = args;
        const result = await initWhatsApp(accountId);
        return { success: result, message: result ? `Successfully initiated WhatsApp linking for ${accountId}.` : `Failed to initiate WhatsApp linking for ${accountId}.` };
      }

      case 'logout_whatsapp': {
        const { accountId } = args;
        const result = await logoutWhatsApp(accountId);
        return { success: result, message: result ? `Successfully disconnected WhatsApp account ${accountId}.` : `Failed to disconnect WhatsApp account ${accountId}.` };
      }

      case 'get_whatsapp_contacts': {
        const { accountId } = args;
        const results = await getWhatsAppContacts(accountId);
        return { success: true, count: results.length, contacts: results };
      }

      case 'get_whatsapp_messages': {
        const { accountId, jid } = args;
        const results = await getWhatsAppMessages(accountId, jid);
        return { success: true, count: results.length, messages: results };
      }

      case 'send_whatsapp_message': {
        const { accountId, phone, message } = args;
        const result = await sendWhatsAppMessage(accountId, phone, message);
        return result;
      }

      case 'delete_whatsapp_message': {
        const { accountId, jid, messageId, fromMe, everyone } = args;
        const result = await deleteWhatsAppMessage(accountId, jid, messageId, fromMe, everyone);
        return result;
      }

      default:
        throw new Error(`Tool "${name}" is not implemented.`);
    }
  };

  // ── Send Message ──────────────────────────────────────────────────────────
  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    const hasImage = !!attachedFile;
    if (!trimmed && !hasImage) return;
    if (isLoading) return;

    if (!apiKey) {
      toast.error('Gemini API Key is missing.');
      return;
    }
    if (!snapshot) {
      toast.error('Syncing data...');
      return;
    }

    setIsLoading(true);
    let uploadedUrl = '';

    if (hasImage && attachedFile) {
      setIsUploadingImage(true);
      try {
        uploadedUrl = await uploadToCloudinary(attachedFile, 'ai_receipts');
      } catch (e: any) {
        console.error('[GlobalAI] Cloudinary upload failed:', e);
        toast.error(`Image upload failed: ${e.message || e}`);
      } finally {
        setIsUploadingImage(false);
      }
    }

    const finalQuery = trimmed || 'Analyze this receipt/slip image and extract details. Ask me what to do with it.';

    const userMsg: ChatMessage = {
      role: 'user',
      content: finalQuery,
      timestamp: new Date().toISOString(),
      imageUrl: uploadedUrl || undefined,
      image: attachedImageBase64 ? { ...attachedImageBase64 } : undefined,
    };

    clearAttachment();

    let updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInputValue('');

    if (user) {
      await saveMessage(user.uid, sessionId, userMsg);
    }

    try {
      let keepLooping = true;
      let loopCount = 0;
      let lastTextResponse = '';
      let lastGeminiRes: any = null;

      while (keepLooping && loopCount < 5) {
        loopCount++;

        setStreamingContent('');
        setStreamingThought('');

        const chatMode = (localStorage.getItem('ai_chat_mode') as 'thinking' | 'fast') || 'thinking';

        const geminiRes = await sendToGeminiStream(
          updatedMessages,
          snapshot,
          globalCurrency.code,
          globalCurrency.symbol,
          (chunk) => {
            setStreamingContent(chunk);
          },
          apiKey,
          (thoughtChunk) => {
            setStreamingThought(thoughtChunk);
          },
          chatMode
        );
        lastGeminiRes = geminiRes;

        setStreamingContent(null);
        setStreamingThought(null);

        if (geminiRes.functionCall) {
          const modelCallMsg: ChatMessage = {
            role: 'model',
            content: `🤖 Action: calling tool \`${geminiRes.functionCall.name}\`...`,
            timestamp: new Date().toISOString(),
            functionCall: geminiRes.functionCall
          };

          updatedMessages = [...updatedMessages, modelCallMsg];
          setMessages(updatedMessages);
          if (user) await saveMessage(user.uid, sessionId, modelCallMsg);

          // Run function locally
          let responseResult: any;
          try {
            responseResult = await executeLocalTool(geminiRes.functionCall.name, geminiRes.functionCall.args);

            // Log action to SQLite
            const status = responseResult.error === 'Operation declined by user.'
              ? 'declined'
              : responseResult.success
                ? 'success'
                : 'failed';
            const errorMsg = responseResult.success ? null : (responseResult.error || 'Execution error');
            if (user) {
              await logAiAgentAction(
                geminiRes.functionCall.name,
                geminiRes.functionCall.args,
                status,
                errorMsg,
                sessionId,
                finalQuery
              );
            }

            if (responseResult.success) {
              toast.success(`Executed: ${geminiRes.functionCall.name.replace(/_/g, ' ')}`);
            } else if (status === 'declined') {
              toast.warning('Action declined.');
            } else {
              toast.error(`Action failed: ${responseResult.error}`);
            }
          } catch (e: any) {
            responseResult = { success: false, error: e.message || 'Execution error' };
            if (user) {
              await logAiAgentAction(
                geminiRes.functionCall.name,
                geminiRes.functionCall.args,
                'failed',
                e.message || 'Execution error',
                sessionId,
                finalQuery
              );
            }
            toast.error(`Action failed: ${e.message}`);
          }

          const userRespMsg: ChatMessage = {
            role: 'user',
            content: `Tool Execution Response: ${JSON.stringify(responseResult)}`,
            timestamp: new Date().toISOString(),
            functionResponse: {
              name: geminiRes.functionCall.name,
              response: responseResult
            }
          };

          updatedMessages = [...updatedMessages, userRespMsg];
          setMessages(updatedMessages);
          if (user) await saveMessage(user.uid, sessionId, userRespMsg);
        } else {
          lastTextResponse = geminiRes.text || '';
          keepLooping = false;
        }
      }

      if (lastTextResponse) {
        const finalModelMsg: ChatMessage = {
          role: 'model',
          content: lastTextResponse,
          thought: lastGeminiRes?.thought,
          timestamp: new Date().toISOString(),
        };

        setMessages(prev => [...prev, finalModelMsg]);
        if (user) {
          await saveMessage(user.uid, sessionId, finalModelMsg);
        }
      }
    } catch (err: any) {
      setStreamingContent(null);
      setStreamingThought(null);
      const errorMsg: ChatMessage = {
        role: 'model',
        content: `⚠️ **Error:** ${err.message || 'AI error occurred.'}`,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setStreamingContent(null);
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleClear = async () => {
    setMessages([]);
    if (user) {
      await clearSession(user.uid, sessionId);
    }
    toast.success('Conversation history cleared');
  };

  // Hide on login, register, and main AI chat screen to prevent duplicates
  if (
    location.pathname === '/login' ||
    location.pathname === '/ai-chat' ||
    !user
  ) {
    return null;
  }

  const isReady = !snapshotLoading && !sessionLoading;

  return (
    <>
      <style>{`
        @keyframes global-wave {
          0%, 100% { height: 3px; }
          50% { height: 12px; }
        }
      `}</style>

      {/* Floating Action Button (FAB) */}
      {!isOpen && (
        <div className="fixed bottom-20 md:bottom-6 right-6 z-[100] animate-in zoom-in duration-200">
          <button
            onClick={() => setIsOpen(true)}
            className="w-14 h-14 rounded-full bg-primary hover:bg-primary/95 text-primary-foreground flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 border border-primary/10 relative group"
            title="Open AI Assistant"
          >
            <Bot className="h-6 w-6 transition-transform duration-200 group-hover:scale-110" />
          </button>
        </div>
      )}

      {/* Responsive Chat Widget */}
      {isOpen && (
        <div className="fixed inset-0 md:inset-auto md:bottom-24 md:right-6 md:w-96 md:h-[550px] z-[150] flex flex-col bg-card/95 md:bg-card border-t md:border border-border md:rounded-2xl shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom md:zoom-in duration-300 overflow-hidden">

          {/* Header */}
          <div className="p-3.5 border-b border-border flex items-center justify-between bg-muted/20 shrink-0">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-primary/10 text-primary rounded-lg">
                <Sparkles size={14} className="animate-pulse" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-foreground leading-none">AI Copilot Widget</h4>

                {/* Model Selector */}
                <div className="relative" ref={modelDropdownRef}>
                  <button
                    onClick={() => setShowModelDropdown(prev => !prev)}
                    className="flex items-center gap-0.5 text-[8px] text-muted-foreground mt-0.5 uppercase tracking-widest font-semibold hover:text-foreground transition-colors"
                  >
                    {getModelById(selectedModelId)?.name || 'Model'}
                    <ChevronDown size={8} />
                  </button>

                  {showModelDropdown && (
                    <div className="absolute top-full left-0 mt-1 w-44 bg-card border border-border rounded-xl shadow-xl z-50 py-1 animate-in fade-in zoom-in duration-150 origin-top-left">
                      <p className="px-3 py-1 text-[7px] font-bold uppercase tracking-widest text-muted-foreground">Switch Model</p>
                      {models.map(m => {
                        const isActive = selectedModelId === m.id;
                        return (
                          <button
                            key={m.id}
                            onClick={() => handleModelSelect(m.id)}
                            className={`w-full text-left px-3 py-1.5 text-[10px] font-medium transition-colors flex items-center justify-between gap-2 ${isActive
                                ? 'bg-primary/5 text-primary'
                                : 'text-foreground hover:bg-muted/50'
                              }`}
                          >
                            <span className="truncate">{m.name}</span>
                            {isActive && <span className="text-primary font-bold">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={loadChatSession}
                title="Refresh messages"
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg transition-colors"
              >
                <RefreshCw size={14} />
              </button>
              <button
                onClick={handleClear}
                title="Clear chat"
                className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg transition-colors"
              >
                <Trash2 size={14} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg transition-colors md:hidden"
                title="Close"
              >
                <ChevronDown size={16} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg transition-colors hidden md:block"
                title="Minimize"
              >
                <Minimize2 size={14} />
              </button>
            </div>
          </div>

          {/* Chat Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
            {!isReady && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                <Loader2 size={20} className="animate-spin text-primary" />
                <p className="text-[10px] font-bold uppercase tracking-widest">Loading assistant…</p>
              </div>
            )}

            {isReady && messages.length === 0 && (
              <div className="h-full flex flex-col justify-center items-center text-center p-4 space-y-4">
                <div className="p-3 bg-primary/5 border border-primary/10 rounded-2xl text-primary shadow-inner">
                  <Bot size={28} />
                </div>
                <div className="space-y-1 max-w-xs">
                  <h5 className="text-xs font-bold text-foreground">Ask Ledger Assistant</h5>
                  <p className="text-[11px] text-muted-foreground leading-normal">
                    I can record expenses, manage loans, and extract details from slips. Try voice commands!
                  </p>
                </div>
              </div>
            )}

            {isReady && messages.map((msg, idx) => (
              <MessageItem key={idx} msg={msg} />
            ))}

            {isLoading && (streamingContent !== null || streamingThought !== null) ? (
              <div className="flex items-end gap-2 justify-start animate-in fade-in duration-200">
                <div className="shrink-0 w-6 h-6 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <Bot size={12} />
                </div>
                <div className="max-w-[85%] rounded-xl rounded-bl-none px-3 py-2 shadow-sm border bg-card text-foreground border-border">
                  {streamingThought && (
                    <div className="mb-2 border-l-2 border-primary/30 pl-2 text-[10px] text-muted-foreground bg-muted/10 rounded p-1.5 border border-border/30">
                      <div className="flex items-center gap-1 font-bold py-0.5">
                        <Bot size={10} className="animate-spin text-primary" />
                        <span>Thinking...</span>
                      </div>
                      <div className="mt-1 font-mono text-[9px] leading-normal whitespace-pre-wrap max-h-24 overflow-y-auto">
                        {streamingThought}
                      </div>
                    </div>
                  )}
                  {streamingContent !== null && (
                    <>
                      <CompactMarkdown content={streamingContent} />
                      <span className="inline-block w-1 h-3.5 bg-primary ml-0.5 animate-pulse" />
                    </>
                  )}
                </div>
              </div>
            ) : isLoading && (
              <div className="flex items-center gap-2 animate-in fade-in duration-200">
                <div className="shrink-0 w-6 h-6 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <Bot size={12} />
                </div>
                <div className="bg-card border border-border rounded-xl rounded-bl-none px-3 py-2 flex items-center gap-1 shadow-sm">
                  {[0, 150, 300].map(delay => (
                    <span
                      key={delay}
                      className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* OCR Attachment Preview */}
          {imagePreviewUrl && (
            <div className="px-3.5 py-1.5 border-t border-border flex items-center justify-between bg-muted/30 shrink-0">
              <div className="flex items-center gap-2">
                <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-border">
                  <img src={imagePreviewUrl} alt="Preview" className="w-full h-full object-cover" />
                </div>
                <div className="text-[10px] leading-tight max-w-[160px] truncate">
                  <p className="font-bold text-foreground truncate">{attachedFile?.name}</p>
                  <p className="text-muted-foreground">{(attachedFile!.size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
              <button
                type="button"
                onClick={clearAttachment}
                className="p-1 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Input Area */}
          <div className="p-3 border-t border-border bg-card shrink-0">
            <form
              onSubmit={e => { e.preventDefault(); handleSend(inputValue); }}
              className="flex gap-1.5"
            >
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading || isUploadingImage || snapshotLoading}
                className="p-2.5 bg-muted/40 hover:bg-muted text-muted-foreground border border-border rounded-xl flex items-center justify-center transition-all"
                title="Attach receipt (OCR)"
              >
                {isUploadingImage ? (
                  <Loader2 size={16} className="animate-spin text-primary" />
                ) : (
                  <Paperclip size={16} />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />

              {isRecording ? (
                <div className="flex-1 px-3 py-2 bg-red-500/5 border border-red-500/20 rounded-xl text-xs font-semibold text-red-500 flex items-center justify-between animate-pulse">
                  <div className="flex items-center gap-1.5">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500"></span>
                    </span>
                    <span>Listening...</span>
                  </div>
                  <div className="flex items-end gap-0.5 h-3.5 pb-0.5">
                    <div className="w-[2px] bg-red-500 rounded-full animate-[global-wave_0.8s_ease-in-out_infinite]" style={{ animationDelay: '0s' }}></div>
                    <div className="w-[2px] bg-red-500 rounded-full animate-[global-wave_0.8s_ease-in-out_infinite]" style={{ animationDelay: '0.15s' }}></div>
                    <div className="w-[2px] bg-red-500 rounded-full animate-[global-wave_0.8s_ease-in-out_infinite]" style={{ animationDelay: '0.3s' }}></div>
                    <div className="w-[2px] bg-red-500 rounded-full animate-[global-wave_0.8s_ease-in-out_infinite]" style={{ animationDelay: '0.45s' }}></div>
                  </div>
                </div>
              ) : (
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  disabled={isLoading || !apiKey || snapshotLoading}
                  placeholder={
                    !apiKey ? 'API key missing…' : snapshotLoading ? 'Syncing...' : 'Ask AI copilot...'
                  }
                  className="flex-1 px-3 py-2 bg-muted/40 border border-border rounded-xl text-xs font-medium focus:bg-background focus:border-primary outline-none transition-all disabled:opacity-50 placeholder:text-muted-foreground/60"
                />
              )}

              <button
                type="button"
                onClick={toggleRecording}
                disabled={isLoading || isUploadingImage || !apiKey || snapshotLoading}
                className={`p-2.5 border rounded-xl flex items-center justify-center transition-all ${isRecording
                  ? 'bg-red-500/10 text-red-500 border-red-500/20 animate-pulse'
                  : 'bg-muted/40 hover:bg-muted text-muted-foreground border-border'
                  }`}
                title="Speech Command"
              >
                {isRecording ? <MicOff size={16} className="text-red-500" /> : <Mic size={16} />}
              </button>

              <button
                type="submit"
                disabled={isLoading || isUploadingImage || (!inputValue.trim() && !attachedFile) || !apiKey || snapshotLoading}
                className="p-2.5 bg-primary text-primary-foreground rounded-xl flex items-center justify-center hover:opacity-90 active:scale-[0.97] transition-all disabled:opacity-40"
              >
                {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </form>
          </div>

          {/* Pending Approval Modal Overlay (Inside the widget frame for full containment) */}
          {pendingApproval && (
            <div className="absolute inset-0 z-[200] flex items-center justify-center p-3 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-card w-full max-w-[280px] rounded-2xl p-4 border border-border shadow-2xl space-y-4 animate-in zoom-in duration-200">
                <div className="flex items-center gap-2 pb-2 border-b border-border text-foreground">
                  <div className={`p-1.5 rounded-lg ${pendingApproval.toolName.startsWith('delete_') ? 'bg-destructive/15 text-destructive' : 'bg-primary/10 text-primary'}`}>
                    <AlertTriangle size={14} />
                  </div>
                  <div>
                    <h5 className="text-[10px] font-bold tracking-tight uppercase leading-none">Confirm AI Change</h5>
                    <p className="text-[8px] text-muted-foreground font-black uppercase mt-0.5 tracking-wider">Action Required</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-[9px] text-muted-foreground font-medium leading-normal">
                    AI request to modify database:
                  </p>
                  <div className="p-2 bg-muted/40 border border-border rounded-lg font-mono text-[9px] overflow-x-auto space-y-1 max-h-24">
                    <p className="font-bold text-foreground">Tool: <span className="text-primary font-mono">{pendingApproval.toolName}</span></p>
                    <pre className="whitespace-pre-wrap leading-tight text-muted-foreground">{JSON.stringify(pendingApproval.args, null, 2)}</pre>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      pendingApproval.resolve(false);
                      setPendingApproval(null);
                    }}
                    className="flex-1 py-2 bg-muted hover:bg-muted/80 text-foreground font-bold rounded-lg text-[9px] uppercase tracking-wider transition-all"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => {
                      pendingApproval.resolve(true);
                      setPendingApproval(null);
                    }}
                    className={`flex-1 py-2 text-white font-bold rounded-lg text-[9px] uppercase tracking-wider transition-all hover:opacity-90 shadow-sm ${pendingApproval.toolName.startsWith('delete_') ? 'bg-destructive shadow-destructive/10' : 'bg-primary shadow-primary/10'
                      }`}
                  >
                    Approve
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};
