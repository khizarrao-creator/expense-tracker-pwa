import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
   Sparkles, Send, Trash2, ArrowLeft, Bot, User,
   HelpCircle, Loader2, RefreshCw, AlertTriangle, Mic, MicOff,
   History, Plus, X, Paperclip, Menu, ChevronDown,
   Download, Camera, CheckSquare, Square, Zap, Brain
 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '../contexts/CurrencyContext';
import { useAuth } from '../contexts/AuthContext';
import { useApp } from '../contexts/AppContext';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

import { getCachedSnapshot, invalidateAICache, type FinancialSnapshot } from '../services/aiDataService';
import {
  loadSession, saveMessage, clearSession, sendToGeminiStream,
  listSessions, deleteSession,
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

// ─── Constants ───────────────────────────────────────────────────────────────

const SESSION_STORAGE_KEY = 'ledger_ai_session_id';

const SUGGESTIONS = [
  { label: '📊 Analyze Spending', text: 'Analyze my spending this month and give me a detailed breakdown.' },
  { label: '⚠️ Budget Status', text: 'Am I over budget on any categories this month? Show me the details.' },
  { label: '💰 Net Worth', text: 'Give me a summary of all my accounts and my current net worth.' },
  { label: '💡 Savings Tips', text: 'Based on my spending habits, suggest 3 ways I can save more money.' },
];

// ─── Markdown Renderer ───────────────────────────────────────────────────────

const MarkdownContent: React.FC<{ content: string }> = ({ content }) => {
  const html = content
    // Escape HTML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Code blocks
    .replace(/```[\w]*\n?([\s\S]*?)```/g, '<pre class="bg-muted/70 border border-border p-3 rounded-xl text-xs font-mono overflow-x-auto my-2">$1</pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">$1</code>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold">$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
    // Headings
    .replace(/^### (.*$)/gm, '<h4 class="text-sm font-bold mt-3 mb-1">$1</h4>')
    .replace(/^## (.*$)/gm, '<h3 class="text-base font-bold mt-4 mb-1.5">$1</h3>')
    .replace(/^# (.*$)/gm, '<h2 class="text-lg font-black mt-4 mb-2">$1</h2>')
    // Bullet lists
    .replace(/^\s*[-•]\s+(.*$)/gm, '<li class="flex gap-2 my-0.5"><span class="text-primary mt-1 shrink-0">•</span><span>$1</span></li>')
    // Numbered lists
    .replace(/^\s*(\d+)\.\s+(.*$)/gm, '<li class="flex gap-2 my-0.5"><span class="text-primary font-bold shrink-0">$1.</span><span>$2</span></li>')
    // Line breaks
    .replace(/\n/g, '<br />');

  return (
    <div
      className="text-sm leading-relaxed space-y-0.5"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

// ─── Message Bubble ──────────────────────────────────────────────────────────

const MessageBubble: React.FC<{
  msg: ChatMessage;
  isLatest: boolean;
  isExportMode?: boolean;
  isSelected?: boolean;
  onToggle?: () => void;
}> = ({ msg, isLatest: _isLatest, isExportMode = false, isSelected = false, onToggle }) => {
  const [isThoughtExpanded, setIsThoughtExpanded] = useState(false);

  if (msg.functionCall) {
    return (
      <div className="flex justify-start pl-10 animate-in fade-in duration-200 w-full">
        {isExportMode && (
          <div data-html2canvas-ignore className="shrink-0 self-center mr-2">
            {isSelected ? (
              <CheckSquare size={16} className="text-primary cursor-pointer" onClick={onToggle} />
            ) : (
              <Square size={16} className="text-muted-foreground cursor-pointer" onClick={onToggle} />
            )}
          </div>
        )}
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/30 border border-border/50 rounded-xl px-3 py-1.5 my-1">
          <Loader2 size={11} className="text-primary animate-spin" />
          <span>AI Action: calling tool <code className="font-mono text-primary bg-primary/5 px-1 rounded">{msg.functionCall.name}</code></span>
        </div>
      </div>
    );
  }

  if (msg.functionResponse) {
    const isSuccess = msg.functionResponse.response?.success !== false;
    return (
      <div className="flex justify-start pl-10 animate-in fade-in duration-200 w-full">
        {isExportMode && (
          <div data-html2canvas-ignore className="shrink-0 self-center mr-2">
            {isSelected ? (
              <CheckSquare size={16} className="text-primary cursor-pointer" onClick={onToggle} />
            ) : (
              <Square size={16} className="text-muted-foreground cursor-pointer" onClick={onToggle} />
            )}
          </div>
        )}
        <div className={`flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider rounded-xl px-3 py-1.5 my-1 border ${isSuccess
            ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : 'bg-destructive/5 border-destructive/10 text-destructive'
          }`}>
          <span>{isSuccess ? '✓' : '⚠️'}</span>
          <span>{isSuccess ? 'Action completed successfully' : `Action failed: ${msg.functionResponse.response?.error}`}</span>
        </div>
      </div>
    );
  }

  const isUser = msg.role === 'user';
  return (
    <div 
      onClick={isExportMode && onToggle ? onToggle : undefined}
      className={`flex items-end gap-2.5 ${isUser ? 'justify-end' : 'justify-start'} 
        ${isExportMode ? 'hover:bg-muted/15 p-2 rounded-2xl transition-all cursor-pointer' : ''}
        animate-in fade-in slide-in-from-bottom-2 duration-300`}
    >
      {isExportMode && (
        <div data-html2canvas-ignore className="shrink-0 self-center mr-1">
          {isSelected ? (
            <CheckSquare size={18} className="text-primary" />
          ) : (
            <Square size={18} className="text-muted-foreground" />
          )}
        </div>
      )}

      {!isUser && (
        <div className="shrink-0 w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-sm shadow-primary/5">
          <Bot size={15} />
        </div>
      )}

      <div className={`max-w-[82%] rounded-2xl px-4 py-3 shadow-sm border ${isUser
          ? 'bg-primary text-primary-foreground border-primary/30 rounded-br-sm'
          : 'bg-card text-foreground border-border rounded-bl-sm'
        }`}>
        {msg.imageUrl && (
          <div className="mb-2 max-w-full overflow-hidden rounded-xl border border-border/30 bg-muted/20">
            <img src={msg.imageUrl} alt="Receipt attachment" className="max-h-60 w-auto object-contain rounded-lg" />
          </div>
        )}
        {!isUser && msg.thought && (
          <div className="mb-2 border-l-2 border-primary/30 pl-2 text-[10px] text-muted-foreground bg-muted/10 rounded-xl p-2 border border-border/30">
            <button
              type="button"
              onClick={(e) => {
                if (isExportMode) {
                  e.stopPropagation();
                }
                setIsThoughtExpanded(!isThoughtExpanded);
              }}
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
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
        ) : (
          <MarkdownContent content={msg.content} />
        )}
        <p className={`text-[10px] mt-1.5 ${isUser ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      {isUser && (
        <div className="shrink-0 w-8 h-8 rounded-xl bg-muted border border-border flex items-center justify-center text-muted-foreground">
          <User size={15} />
        </div>
      )}
    </div>
  );
};

// ─── Typing Indicator ────────────────────────────────────────────────────────

const TypingIndicator: React.FC = () => (
  <div className="flex items-end gap-2.5 animate-in fade-in duration-200">
    <div className="shrink-0 w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
      <Bot size={15} />
    </div>
    <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5 shadow-sm">
      {[0, 150, 300].map(delay => (
        <span
          key={delay}
          className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  </div>
);

// ─── Main Component ──────────────────────────────────────────────────────────

const AIChat: React.FC = () => {
  const navigate = useNavigate();
  const { currency: globalCurrency } = useCurrency();
  const { user } = useAuth();
  const { userPlan, planLimits } = useApp();

  const apiKey = getApiKey() || undefined;

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
  const [snapshotError, setSnapshotError] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);

  // Export & Selection states
  const [isExportMode, setIsExportMode] = useState(false);
  const [selectedMsgIndices, setSelectedMsgIndices] = useState<Set<number>>(new Set());
  const [exportFormat, setExportFormat] = useState<'png' | 'pdf' | 'md'>('png');
  const [pngQuality, setPngQuality] = useState<'hd' | '4k'>('hd');
  const [isExporting, setIsExporting] = useState(false);

  // Sync selected messages when Export Mode turns on
  useEffect(() => {
    if (isExportMode) {
      setSelectedMsgIndices(new Set(messages.map((_, idx) => idx)));
    } else {
      setSelectedMsgIndices(new Set());
    }
  }, [isExportMode, messages.length]);

  // Chat History Sidebar States
  const [sessionsList, setSessionsList] = useState<{ sessionId: string; updatedAt: string; title: string }[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // OCR / Receipt Upload States
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [attachedImageBase64, setAttachedImageBase64] = useState<{ mimeType: string; data: string } | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // ── Voice Recording States ──────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Model selector state
  const models = getModelRegistry();
  const [selectedModelId, setSelectedModelId] = useState<string>(() => {
    const saved = localStorage.getItem('ai_preferred_model_id');
    const registry = getModelRegistry();
    if (saved && registry.some(m => m.id === saved)) return saved;
    return getDefaultModel().id;
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
    if (userPlan === 'standard') {
      setSelectedModelId('gemma-4-31b');
    } else {
      const defaultModelId = getDefaultModel().id;
      const saved = localStorage.getItem('ai_preferred_model_id');
      if (!saved || !models.some(m => m.id === saved)) {
        setSelectedModelId(defaultModelId);
      }
    }
  }, [userPlan, models]);

  // Chat Mode Setting (Thinking vs Fast)
  const [chatMode, setChatMode] = useState<'thinking' | 'fast'>(() => {
    return (localStorage.getItem('ai_chat_mode') as 'thinking' | 'fast') || 'thinking';
  });

  const handleToggleChatMode = () => {
    const nextMode = chatMode === 'thinking' ? 'fast' : 'thinking';
    setChatMode(nextMode);
    localStorage.setItem('ai_chat_mode', nextMode);
    toast.success(`Switched to ${nextMode === 'thinking' ? 'Thinking' : 'Fast'} Mode`);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Streaming state
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [streamingThought, setStreamingThought] = useState<string | null>(null);

  // Approval Settings & Pending Approval States
  const [pendingApproval, setPendingApproval] = useState<{
    toolName: string;
    args: any;
    resolve: (approved: boolean) => void;
  } | null>(null);

  const getApproveMode = (): 'auto' | 'manual' => {
    return (localStorage.getItem('ai_agent_approve_mode') as 'auto' | 'manual') || 'manual';
  };

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // ── Load snapshot from cache (or rebuild) ─────────────────────────────────

  const loadSnapshot = useCallback(async () => {
    setSnapshotLoading(true);
    setSnapshotError(false);
    try {
      const snap = await getCachedSnapshot();
      setSnapshot(snap);
    } catch (e) {
      console.error('[AIChat] Failed to load financial snapshot:', e);
      setSnapshotError(true);
    } finally {
      setSnapshotLoading(false);
    }
  }, []);

  // ── Load session from Firestore ───────────────────────────────────────────

  const loadChatSession = useCallback(async () => {
    if (!user) {
      setSessionLoading(false);
      return;
    }
    setSessionLoading(true);
    try {
      const session = await loadSession(user.uid, sessionId);
      setMessages(session.messages);
    } catch (e) {
      console.warn('[AIChat] Could not load Firestore session, starting fresh:', e);
    } finally {
      setSessionLoading(false);
    }
  }, [user, sessionId]);

  // ── Load sessions list from Firestore ─────────────────────────────────────

  const loadSessionsList = useCallback(async () => {
    if (!user) return;
    try {
      const list = await listSessions(user.uid);
      setSessionsList(list);
    } catch (e) {
      console.warn('[AIChat] Failed to load sessions list:', e);
    }
  }, [user]);

  // ── Select a past session ─────────────────────────────────────────────────

  const selectSession = (id: string) => {
    setSessionId(id);
    localStorage.setItem(SESSION_STORAGE_KEY, id);
    setIsHistoryOpen(false);
    toast.success('Conversation switched');
  };

  // ── Start a new conversation thread ───────────────────────────────────────

  const startNewChat = () => {
    const newId = uuidv4();
    setSessionId(newId);
    localStorage.setItem(SESSION_STORAGE_KEY, newId);
    setMessages([]);
    setIsHistoryOpen(false);
    toast.success('Started a new chat');
  };

  // ── Delete a session ──────────────────────────────────────────────────────

  const handleDeleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!user) return;
    if (!confirm('Are you sure you want to delete this chat session?')) return;
    try {
      await deleteSession(user.uid, id);
      toast.success('Chat session deleted');
      if (id === sessionId) {
        startNewChat();
      } else {
        loadSessionsList();
      }
    } catch (e) {
      toast.error('Failed to delete chat session');
    }
  };

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

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    loadSnapshot();
    loadChatSession();
    loadSessionsList();
  }, [loadSnapshot, loadChatSession, loadSessionsList, sessionId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // ── Send message ─────────────────────────────────────────────────────────

  // ── Execute Local Database Query Tools ────────────────────────────────────
  const executeLocalTool = async (name: string, args: any): Promise<any> => {
    // extra safety net validation
    const isMutationOp = name.startsWith('add_') || name.startsWith('update_') || name.startsWith('delete_');
    const isWhatsAppOp = name.includes('whatsapp');
    
    if (userPlan === 'standard' && isMutationOp) {
      return { success: false, error: 'AI Copilot features (mutations) are disabled on the Standard plan. Please upgrade to Pro or Max to enable.' };
    }
    if ((userPlan === 'standard' || userPlan === 'pro') && isWhatsAppOp) {
      return { success: false, error: 'WhatsApp Copilot features are only available on the Max plan. Please upgrade to Max to unlock.' };
    }

    // Check if this is a mutation operation that needs manual approval
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

        // Match accounts
        const allAccounts = await getAccounts();
        const fromAcc = allAccounts.find(a => a.name.trim().toLowerCase() === account_name.trim().toLowerCase());
        if (!fromAcc) {
          return { success: false, error: `Account "${account_name}" not found. Available: ${allAccounts.map(a => a.name).join(', ')}` };
        }

        let toAccId: string | null = null;
        if (type === 'transfer' && to_account_name) {
          const toAcc = allAccounts.find(a => a.name.trim().toLowerCase() === to_account_name.trim().toLowerCase());
          if (!toAcc) {
            return { success: false, error: `Destination account "${to_account_name}" not found.` };
          }
          toAccId = toAcc.id;
        }

        const dateStr = date || new Date().toISOString().split('T')[0];

        const id = await addTransaction(
          type,
          parseFloat(amount),
          category,
          description || '',
          dateStr,
          payment_method || 'Debit Card',
          fromAcc.id,
          toAccId,
          subcategory || null,
          undefined,
          null,
          null,
          null,
          transfer_fee ? parseFloat(transfer_fee) : 0
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
        return { success: true, transaction_id: id, message: `Successfully updated transaction ${id}.` };
      }

      case 'delete_transaction': {
        const { id } = args;
        await deleteTransaction(id);
        invalidateAICache();
        await loadSnapshot();
        return { success: true, message: `Successfully deleted transaction ${id}.` };
      }

      case 'get_transactions': {
        const { limit, offset } = args;
        const results = await getTransactions(limit || 50, offset || 0);
        return { success: true, count: results.length, transactions: results };
      }

      case 'add_loan': {
        const { direction, party_name, amount, date, description, due_date, category, account_name } = args;

        // Find or create loan party
        const allParties = await getLoanParties();
        let party = allParties.find(p => p.name.trim().toLowerCase() === party_name.trim().toLowerCase());
        let partyId = party?.id;
        if (!partyId) {
          partyId = await addLoanParty(party_name, '', '', 'Created automatically by AI Agent');
        }

        // Find account if specified
        let accId: string | null = null;
        if (account_name) {
          const allAccounts = await getAccounts();
          const acc = allAccounts.find(a => a.name.trim().toLowerCase() === account_name.trim().toLowerCase());
          if (acc) {
            accId = acc.id;
          }
        }

        const dateStr = date || new Date().toISOString().split('T')[0];

        const id = await addLoan(
          direction,
          partyId,
          parseFloat(amount),
          dateStr,
          description || '',
          due_date || null,
          category || 'Personal',
          0,
          'none',
          accId
        );

        invalidateAICache();
        await loadSnapshot();

        return { success: true, loan_id: id, message: `Successfully recorded loan ${direction} to/from ${party_name} of ${amount}.` };
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
        return { success: true, loan_id: id, message: `Successfully updated loan ${id}.` };
      }

      case 'delete_loan': {
        const { id } = args;
        await deleteLoan(id);
        invalidateAICache();
        await loadSnapshot();
        return { success: true, message: `Successfully deleted loan ${id}.` };
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
        return { success: true, party_id: id, message: `Successfully created counterparty ${name}.` };
      }

      case 'update_loan_party': {
        const { id, updates } = args;
        await updateLoanParty(id, updates);
        invalidateAICache();
        await loadSnapshot();
        return { success: true, party_id: id, message: `Successfully updated counterparty ${id}.` };
      }

      case 'delete_loan_party': {
        const { id } = args;
        await deleteLoanParty(id);
        invalidateAICache();
        await loadSnapshot();
        return { success: true, message: `Successfully deleted counterparty ${id}.` };
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
          if (parent) {
            parentId = parent.id;
          }
        }

        const id = await addCategory(name, type, icon || '', parentId);
        invalidateAICache();
        await loadSnapshot();
        return { success: true, category_id: id, message: `Successfully created category ${name}.` };
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
        return { success: true, category_id: id, message: `Successfully updated category ${id}.` };
      }

      case 'delete_category': {
        const { id } = args;
        await deleteCategory(id);
        invalidateAICache();
        await loadSnapshot();
        return { success: true, message: `Successfully deleted category ${id}.` };
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

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    const hasImage = !!attachedFile;
    if (!trimmed && !hasImage) return;
    if (isLoading) return;

    if (!apiKey) {
      toast.error('Gemini API Key is missing. Add VITE_GEMINI_API_KEY to your .env file.');
      return;
    }
    if (!snapshot) {
      toast.error('Financial data is still loading. Please wait a moment.');
      return;
    }

    setIsLoading(true);
    let uploadedUrl = '';

    if (hasImage && attachedFile) {
      if (userPlan === 'standard') {
        toast.error('Image uploads and receipt parsing are disabled on the Standard plan. Please upgrade to Pro or Max to unlock.');
        setIsLoading(false);
        return;
      }

      // Check Daily Upload Limits for Pro/Max
      const todayStr = new Date().toISOString().split('T')[0];
      const savedDate = localStorage.getItem('ai_uploads_date');
      let uploadCount = Number(localStorage.getItem('ai_uploads_today') || '0');
      if (savedDate !== todayStr) {
        uploadCount = 0;
        localStorage.setItem('ai_uploads_date', todayStr);
        localStorage.setItem('ai_uploads_today', '0');
      }

      const maxUploads = planLimits?.maxUploadsPerDay ?? 10;
      if (maxUploads !== -1 && uploadCount >= maxUploads) {
        toast.error(`Daily AI upload limit reached (${maxUploads} uploads). Please upgrade your plan for higher limits.`);
        setIsLoading(false);
        return;
      }

      setIsUploadingImage(true);
      try {
        uploadedUrl = await uploadToCloudinary(attachedFile, 'ai_receipts');
        localStorage.setItem('ai_uploads_today', (uploadCount + 1).toString());
        toast.success('Receipt uploaded to cloud!');
      } catch (e: any) {
        console.error('[AIChat] Cloudinary upload failed:', e);
        toast.error(`Cloudinary upload failed: ${e.message || e}`);
        setIsLoading(false);
        setIsUploadingImage(false);
        return;
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

    // Clear attachment state
    clearAttachment();

    let updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInputValue('');

    if (user) {
      await saveMessage(user.uid, sessionId, userMsg);
      loadSessionsList();
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
          chatMode,
          userPlan
        );
        lastGeminiRes = geminiRes;

        setStreamingContent(null);
        setStreamingThought(null);

        if (geminiRes.functionCall) {
          const modelCallMsg: ChatMessage = {
            role: 'model',
            content: `🤖 Agent Action: calling tool \`${geminiRes.functionCall.name}\`...`,
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

            // Log the action to SQLite
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
              toast.success(`AI Action: ${geminiRes.functionCall.name.replace(/_/g, ' ')} successfully executed!`);
            } else if (status === 'declined') {
              toast.warning('Action declined by user.');
            } else {
              toast.error(`AI Action failed: ${responseResult.error}`);
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
            toast.error(`AI Action failed: ${e.message}`);
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
        content: `⚠️ **Error:** ${err.message || 'Could not reach the AI model. Please check your connection and API key.'}`,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMsg]);
      toast.error('AI request failed. Check console for details.');
    } finally {
      setStreamingContent(null);
      setStreamingThought(null);
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  // ── Clear chat ───────────────────────────────────────────────────────────

  const handleClear = async () => {
    setMessages([]);
    if (user) {
      await clearSession(user.uid, sessionId);
    }
    toast.success('Chat cleared');
  };

  // ── Chat Export & Screenshot Logic ────────────────────────────────────────
  const handleExecuteExport = async () => {
    if (selectedMsgIndices.size === 0) return;
    setIsExporting(true);

    try {
      const selectedMsgs = messages.filter((_, idx) => selectedMsgIndices.has(idx));

      if (exportFormat === 'md') {
        let mdText = `# Ledger AI Chat Transcript\n\n`;
        mdText += `*Generated on: ${new Date().toLocaleString()}*\n\n`;
        mdText += `---\n\n`;

        selectedMsgs.forEach(msg => {
          const roleName = msg.role === 'user' ? 'User' : 'AI Assistant';
          mdText += `### **${roleName}** *(${new Date(msg.timestamp).toLocaleTimeString()})*\n\n`;
          if (msg.thought) {
            mdText += `> **Thinking Process:**\n> ${msg.thought.replace(/\n/g, '\n> ')}\n\n`;
          }
          mdText += `${msg.content}\n\n`;
          if (msg.imageUrl) {
            mdText += `![Attachment](${msg.imageUrl})\n\n`;
          }
          mdText += `---\n\n`;
        });

        const blob = new Blob([mdText], { type: 'text/markdown;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `chat_export_${sessionId}.md`;
        link.click();
        URL.revokeObjectURL(url);
        toast.success('Markdown transcript downloaded successfully!');
        setIsExportMode(false);
      } 
      else if (exportFormat === 'pdf') {
        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4'
        });

        let y = 20;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text('Ledger AI Chat Transcript', 20, y);
        y += 10;
        
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Exported on: ${new Date().toLocaleString()}`, 20, y);
        y += 15;

        selectedMsgs.forEach((msg) => {
          if (y > 270) {
            doc.addPage();
            y = 20;
          }

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          const roleName = msg.role === 'user' ? 'User' : 'AI Assistant';
          const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          doc.text(`${roleName} (${timeStr})`, 20, y);
          y += 6;

          if (msg.thought) {
            if (y > 270) {
              doc.addPage();
              y = 20;
            }
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(8.5);
            doc.setTextColor(120, 120, 120);
            
            const thoughtText = `Thinking Process:\n${msg.thought}`;
            const splitThought = doc.splitTextToSize(thoughtText, 170);
            for (const line of splitThought) {
              if (y > 270) {
                doc.addPage();
                y = 20;
              }
              doc.text(line, 20, y);
              y += 4.5;
            }
            y += 4;
            doc.setTextColor(0, 0, 0);
          }

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9.5);
          
          const splitContent = doc.splitTextToSize(msg.content, 170);
          for (const line of splitContent) {
            if (y > 270) {
              doc.addPage();
              y = 20;
            }
            doc.text(line, 20, y);
            y += 5.5;
          }
          
          y += 8;
        });

        doc.save(`chat_export_${sessionId}.pdf`);
        toast.success('PDF document downloaded successfully!');
        setIsExportMode(false);
      } 
      else if (exportFormat === 'png') {
        const container = document.getElementById('chat-messages-container');
        if (!container) throw new Error('Chat messages container element not found.');

        const html2canvas = (await import('html2canvas')).default;
        const scale = pngQuality === '4k' ? 4 : 2;

        const canvas = await html2canvas(container, {
          scale,
          useCORS: true,
          logging: false,
          scrollX: 0,
          scrollY: -container.scrollTop,
          height: container.scrollHeight,
          windowHeight: container.scrollHeight,
          backgroundColor: '#121212',
          onclone: (clonedDoc) => {
            const clonedContainer = clonedDoc.getElementById('chat-messages-container');
            if (clonedContainer) {
              clonedContainer.style.overflow = 'visible';
              clonedContainer.style.height = 'auto';
              clonedContainer.style.maxHeight = 'none';
            }
          }
        });

        const totalHeight = canvas.height;
        const width = canvas.width;
        const maxSliceHeight = 1800 * scale; 

        if (totalHeight > maxSliceHeight) {
          const numSlices = Math.ceil(totalHeight / maxSliceHeight);
          toast.info(`Long chat detected! Saving as ${numSlices} separate images...`);

          for (let i = 0; i < numSlices; i++) {
            const sliceCanvas = document.createElement('canvas');
            sliceCanvas.width = width;
            sliceCanvas.height = Math.min(maxSliceHeight, totalHeight - i * maxSliceHeight);

            const ctx = sliceCanvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(
                canvas,
                0, i * maxSliceHeight, width, sliceCanvas.height,
                0, 0, width, sliceCanvas.height
              );

              const link = document.createElement('a');
              link.download = `chat_screenshot_${sessionId}_part_${i + 1}.png`;
              link.href = sliceCanvas.toDataURL('image/png');
              link.click();
            }
          }
          toast.success(`Exported ${numSlices} screenshots!`);
        } else {
          const link = document.createElement('a');
          link.download = `chat_screenshot_${sessionId}.png`;
          link.href = canvas.toDataURL('image/png');
          link.click();
          toast.success('Screenshot downloaded successfully!');
        }

        setIsExportMode(false);
      }
    } catch (e: any) {
      console.error('[Export Error]:', e);
      toast.error(`Export failed: ${e.message || 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  };

  // ── Refresh snapshot ─────────────────────────────────────────────────────

  const handleRefreshSnapshot = async () => {
    invalidateAICache();
    await loadSnapshot();
    toast.success('Financial data refreshed');
  };

  // ── Derived ──────────────────────────────────────────────────────────────

  const isReady = !snapshotLoading && !sessionLoading;
  const showEmptyState = isReady && messages.length === 0;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-8rem)] md:h-[calc(100vh-4rem)] max-w-4xl mx-auto bg-card rounded-2xl border border-border overflow-hidden shadow-sm relative">
      <style>{`
        @keyframes wave {
          0%, 100% { height: 4px; }
          50% { height: 14px; }
        }
      `}</style>

      {/* ── Chat History Sidebar Drawer ── */}
      {isHistoryOpen && (
        <div className="absolute inset-y-0 left-0 z-50 w-72 bg-card border-r border-border flex flex-col animate-in slide-in-from-left duration-200">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-bold flex items-center gap-2 text-foreground">
              <History size={16} />
              Saved Chats
            </h3>
            <div className="flex items-center gap-1">
              <button
                onClick={startNewChat}
                className="p-1.5 hover:bg-primary/10 text-primary rounded-lg transition-colors"
                title="New Chat"
              >
                <Plus size={16} />
              </button>
              <button
                onClick={() => setIsHistoryOpen(false)}
                className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {sessionsList.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No saved conversations</p>
            ) : (
              sessionsList.map((s) => (
                <div
                  key={s.sessionId}
                  onClick={() => selectSession(s.sessionId)}
                  className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border ${s.sessionId === sessionId
                      ? 'bg-primary/5 border-primary/20 text-primary font-bold'
                      : 'border-transparent hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                    }`}
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <p className="text-xs truncate">{s.title}</p>
                    <p className="text-[9px] text-muted-foreground/75 mt-0.5">
                      {new Date(s.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}{' '}
                      {new Date(s.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <button
                    onClick={(e) => handleDeleteSession(e, s.sessionId)}
                    className="p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete conversation"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Main Chat Area ── */}
      <div className="flex-1 flex flex-col min-w-0 h-full">

        {/* ── Header ── */}
        <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsHistoryOpen(prev => !prev)}
              className="p-2 hover:bg-muted rounded-xl transition-colors text-muted-foreground hover:text-foreground"
              title="Toggle sidebar history"
            >
              <Menu size={20} />
            </button>
            <button
              onClick={() => navigate('/more')}
              className="p-2 hover:bg-muted rounded-xl transition-colors text-muted-foreground hover:text-foreground"
              title="Go back"
            >
              <ArrowLeft size={20} />
            </button>
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-primary/10 text-primary rounded-xl">
                  <Sparkles size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-black tracking-tight leading-none">Rao Ai</h2>

                  {/* Model Selector Dropdown */}
                  <div className="relative mt-0.5" ref={modelDropdownRef}>
                    {userPlan === 'standard' ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 cursor-not-allowed">
                        {snapshotLoading ? (
                          <><Loader2 size={9} className="animate-spin" /> Syncing data…</>
                        ) : snapshotError ? (
                          <span className="text-destructive"><AlertTriangle size={9} className="inline mr-0.5" />Data error</span>
                        ) : (
                          <>{getModelById('gemma-4-31b')?.name || 'Gemma 4 31B'} (Standard Lock) · {snapshot ? new Date(snapshot.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</>
                        )}
                      </span>
                    ) : (
                      <button
                        onClick={() => setShowModelDropdown(prev => !prev)}
                        className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {snapshotLoading ? (
                          <><Loader2 size={9} className="animate-spin" /> Syncing data…</>
                        ) : snapshotError ? (
                          <span className="text-destructive"><AlertTriangle size={9} className="inline mr-0.5" />Data error</span>
                        ) : (
                          <>{getModelById(selectedModelId)?.name || 'Model'} · {snapshot ? new Date(snapshot.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</>
                        )}
                        <ChevronDown size={10} />
                      </button>
                    )}

                    {showModelDropdown && userPlan !== 'standard' && (
                      <div className="absolute top-full left-0 mt-1 w-52 bg-card border border-border rounded-xl shadow-xl z-50 py-1.5 animate-in fade-in zoom-in duration-150 origin-top-left">
                        <p className="px-3 py-1 text-[8px] font-bold uppercase tracking-widest text-muted-foreground">Switch Model</p>
                        {models.map(m => {
                          const isActive = selectedModelId === m.id;
                          return (
                            <button
                              key={m.id}
                              onClick={() => handleModelSelect(m.id)}
                              className={`w-full text-left px-3 py-2 text-[11px] font-medium transition-colors flex items-center justify-between gap-2 ${
                                isActive
                                  ? 'bg-primary/5 text-primary'
                                  : 'text-foreground hover:bg-muted/50'
                              }`}
                            >
                              <span className="truncate">{m.name}</span>
                              {isActive && <span className="text-primary text-[8px] font-bold">✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
          </div>

          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={() => setIsExportMode(prev => !prev)}
                title="Export or screenshot conversation"
                className={`p-2 rounded-xl transition-all ${
                  isExportMode
                    ? 'text-primary bg-primary/10'
                    : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
                }`}
              >
                <Download size={16} />
              </button>
            )}
            <button
              onClick={handleRefreshSnapshot}
              disabled={snapshotLoading}
              title="Refresh financial data"
              className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl transition-all disabled:opacity-40"
            >
              <RefreshCw size={16} className={snapshotLoading ? 'animate-spin' : ''} />
            </button>
            {messages.length > 0 && (
              <button
                onClick={handleClear}
                title="Clear chat"
                className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>

        {/* ── Export Controls Panel ── */}
        {isExportMode && (
          <div className="bg-primary/5 border-b border-border/80 p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 animate-in slide-in-from-top duration-200 text-xs shrink-0">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <span className="font-bold text-foreground">Export Chat:</span>
                <span className="ml-1 text-muted-foreground">({selectedMsgIndices.size} of {messages.length} messages selected)</span>
              </div>
              <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg border border-border/50">
                {(['png', 'pdf', 'md'] as const).map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => setExportFormat(fmt)}
                    className={`px-2.5 py-1 rounded-md font-bold uppercase text-[10px] tracking-wider transition-all ${
                      exportFormat === fmt
                        ? 'bg-card text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>

              {exportFormat === 'png' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Quality:</span>
                  <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg border border-border/50">
                    {(['hd', '4k'] as const).map(q => (
                      <button
                        key={q}
                        onClick={() => setPngQuality(q)}
                        className={`px-2 py-0.5 rounded-md font-bold uppercase text-[9px] tracking-wider transition-all ${
                          pngQuality === q
                            ? 'bg-card text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 self-end md:self-auto">
              <button
                type="button"
                onClick={() => setIsExportMode(false)}
                className="px-3 py-1.5 hover:bg-muted text-muted-foreground rounded-xl transition-all font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={selectedMsgIndices.size === 0 || isExporting}
                onClick={handleExecuteExport}
                className="px-3 py-1.5 bg-primary text-primary-foreground hover:opacity-90 active:scale-95 rounded-xl transition-all font-bold flex items-center gap-1 animate-pulse"
              >
                {isExporting ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <Camera size={12} />
                    <span>Export</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── Chat Body ── */}
        <div id="chat-messages-container" className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Loading skeleton */}
          {!isReady && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <Loader2 className="animate-spin text-primary" size={28} />
              <p className="text-xs font-bold uppercase tracking-widest">Loading your financial context…</p>
            </div>
          )}

          {/* Error state */}
          {isReady && snapshotError && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-6">
              <div className="p-4 bg-destructive/10 text-destructive rounded-2xl">
                <AlertTriangle size={32} />
              </div>
              <div>
                <p className="font-bold text-foreground">Could not load financial data</p>
                <p className="text-sm text-muted-foreground mt-1">The AI will have limited context without it.</p>
              </div>
              <button
                onClick={handleRefreshSnapshot}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 transition-opacity"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Empty / welcome state */}
          {showEmptyState && !snapshotError && (
            <div className="h-full flex flex-col justify-center items-center text-center p-4 space-y-6 animate-in fade-in duration-300">
              <div className="p-5 bg-primary/5 border border-primary/10 rounded-3xl text-primary shadow-inner">
                <Bot size={44} />
              </div>
              <div className="max-w-sm space-y-1.5">
                <h3 className="text-lg font-black tracking-tight">Ask your Financial Copilot</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  I have access to your real accounts, transactions, budgets, and goals. Ask me anything.
                </p>
              </div>

              {/* Suggestion chips */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg pt-2">
                {SUGGESTIONS.map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(s.text)}
                    disabled={isLoading || !apiKey || snapshotLoading}
                    className="p-4 bg-muted/40 hover:bg-primary/5 border border-transparent hover:border-primary/30 rounded-2xl text-left transition-all active:scale-[0.98] group flex gap-3 items-start disabled:opacity-50"
                  >
                    <HelpCircle size={16} className="text-muted-foreground group-hover:text-primary shrink-0 mt-0.5 transition-colors" />
                    <div>
                      <p className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">{s.label}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">{s.text}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {isReady && messages.map((msg, idx) => (
            <MessageBubble
              key={idx}
              msg={msg}
              isLatest={idx === messages.length - 1}
              isExportMode={isExportMode}
              isSelected={selectedMsgIndices.has(idx)}
              onToggle={() => {
                const next = new Set(selectedMsgIndices);
                if (next.has(idx)) {
                  next.delete(idx);
                } else {
                  next.add(idx);
                }
                setSelectedMsgIndices(next);
              }}
            />
          ))}

          {/* Streaming message (live-updating response) */}
          {isLoading && (streamingContent !== null || streamingThought !== null) ? (
            <div className={`flex items-end gap-2.5 justify-start animate-in fade-in duration-200`}>
              <div className="shrink-0 w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <Bot size={15} />
              </div>
              <div className="max-w-[82%] rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border bg-card text-foreground border-border">
                {streamingThought && (
                  <div className="mb-2 border-l-2 border-primary/30 pl-2 text-[10px] text-muted-foreground bg-muted/10 rounded-xl p-2 border border-border/30">
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
                    <MarkdownContent content={streamingContent} />
                    <span className="inline-block w-1.5 h-4 bg-primary ml-0.5 animate-pulse" />
                  </>
                )}
              </div>
            </div>
          ) : isLoading && <TypingIndicator />}

          <div ref={chatEndRef} />
        </div>

        {/* ── Input Area ── */}
        <div className="p-4 border-t border-border shrink-0 bg-card">
          {!apiKey && (
            <div className="mb-3 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-xl text-xs font-semibold flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="shrink-0" />
                <span>Gemini API Key is missing. Please contact the administrator to assign a Gemini API Key to your account or configure a global fallback key.</span>
              </div>
              <button
                type="button"
                onClick={() => navigate('/settings')}
                className="text-xs bg-destructive/20 hover:bg-destructive/30 text-destructive-foreground px-3 py-1 rounded-lg transition-all font-bold self-start sm:self-auto shrink-0"
              >
                Go to Settings
              </button>
            </div>
          )}

          {/* OCR Receipt Upload Preview */}
          {imagePreviewUrl && (
            <div className="mb-3 p-2 bg-muted/40 border border-border rounded-xl flex items-center justify-between animate-in slide-in-from-bottom duration-200">
              <div className="flex items-center gap-3">
                <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-border">
                  <img src={imagePreviewUrl} alt="Preview" className="w-full h-full object-cover" />
                </div>
                <div className="text-[11px] leading-tight">
                  <p className="font-bold text-foreground truncate max-w-[200px]">{attachedFile?.name}</p>
                  <p className="text-muted-foreground">{(attachedFile!.size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
              <button
                type="button"
                onClick={clearAttachment}
                className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors"
                title="Remove attachment"
              >
                <X size={14} />
              </button>
            </div>
          )}

          <form
            onSubmit={e => { e.preventDefault(); handleSend(inputValue); }}
            className="flex gap-2"
          >
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || isUploadingImage || snapshotLoading}
              className="px-3 py-3 bg-muted/40 hover:bg-muted text-muted-foreground border border-border rounded-xl flex items-center justify-center transition-all"
              title="Attach receipt image (OCR)"
            >
              {isUploadingImage ? (
                <Loader2 size={18} className="animate-spin text-primary" />
              ) : (
                <Paperclip size={18} />
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
              <div className="flex-1 px-4 py-3 bg-red-500/5 border border-red-500/20 rounded-xl text-sm font-semibold text-red-500 flex items-center justify-between animate-pulse">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                  <span>Listening... speak clearly</span>
                </div>
                <div className="flex items-end gap-1 h-5 pb-0.5">
                  <div className="w-[3px] bg-red-500 rounded-full animate-[wave_0.8s_ease-in-out_infinite]" style={{ animationDelay: '0s' }}></div>
                  <div className="w-[3px] bg-red-500 rounded-full animate-[wave_0.8s_ease-in-out_infinite]" style={{ animationDelay: '0.15s' }}></div>
                  <div className="w-[3px] bg-red-500 rounded-full animate-[wave_0.8s_ease-in-out_infinite]" style={{ animationDelay: '0.3s' }}></div>
                  <div className="w-[3px] bg-red-500 rounded-full animate-[wave_0.8s_ease-in-out_infinite]" style={{ animationDelay: '0.45s' }}></div>
                  <div className="w-[3px] bg-red-500 rounded-full animate-[wave_0.8s_ease-in-out_infinite]" style={{ animationDelay: '0.6s' }}></div>
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
                  !apiKey
                    ? 'API key missing…'
                    : snapshotLoading
                      ? 'Syncing financial data…'
                      : 'Ask or give a voice command…'
                }
                className="flex-1 px-4 py-3 bg-muted/40 border border-border rounded-xl text-sm font-medium focus:bg-background focus:border-primary outline-none transition-all disabled:opacity-50 placeholder:text-muted-foreground/60"
              />
            )}

            <button
              type="button"
              onClick={toggleRecording}
              disabled={isLoading || isUploadingImage || !apiKey || snapshotLoading}
              className={`px-3 py-3 border rounded-xl flex items-center justify-center transition-all ${isRecording
                  ? 'bg-red-500/10 text-red-500 border-red-500/20 animate-pulse'
                  : 'bg-muted/40 hover:bg-muted text-muted-foreground border-border'
                }`}
              title={isRecording ? 'Stop listening' : 'Record voice command'}
            >
              {isRecording ? <MicOff size={18} className="animate-bounce text-red-500" /> : <Mic size={18} />}
            </button>
            <button
              type="button"
              onClick={handleToggleChatMode}
              disabled={isLoading || isUploadingImage || !apiKey || snapshotLoading}
              title={`Switch to ${chatMode === 'thinking' ? 'Fast' : 'Thinking'} Mode`}
              className={`px-3 py-3 border rounded-xl flex items-center justify-center gap-1.5 transition-all text-xs font-bold uppercase tracking-wider select-none ${
                chatMode === 'thinking'
                  ? 'bg-primary/10 border-primary/20 text-primary shadow-[0_0_10px_rgba(var(--primary-rgb),0.1)]'
                  : 'bg-muted/40 hover:bg-muted text-muted-foreground border-border'
              }`}
            >
              {chatMode === 'thinking' ? (
                <>
                  <Brain size={16} className="text-primary animate-bounce duration-1000" />
                  <span className="hidden sm:inline">Thinking</span>
                </>
              ) : (
                <>
                  <Zap size={16} className="text-amber-500 fill-amber-500/20" />
                  <span className="hidden sm:inline">Fast</span>
                </>
              )}
            </button>
            <button
              type="submit"
              disabled={isLoading || isUploadingImage || (!inputValue.trim() && !attachedFile) || !apiKey || snapshotLoading}
              className="px-4 py-3 bg-primary text-primary-foreground rounded-xl flex items-center justify-center hover:opacity-90 active:scale-[0.97] transition-all disabled:opacity-40"
            >
              {isLoading
                ? <Loader2 size={18} className="animate-spin" />
                : <Send size={18} />
              }
            </button>
          </form>
        </div>

      </div>

      {/* ── Approval Modal Overlay ── */}
      {pendingApproval && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-card w-full max-w-md rounded-3xl p-6 border border-border shadow-2xl space-y-5 animate-in zoom-in duration-200">
            <div className="flex items-center gap-3 pb-3 border-b border-border text-foreground">
              <div className={`p-2.5 rounded-xl ${pendingApproval.toolName.startsWith('delete_') ? 'bg-destructive/15 text-destructive' : 'bg-primary/10 text-primary'}`}>
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold tracking-tight uppercase">AI Agent Mutation Request</h3>
                <p className="text-[10px] text-muted-foreground font-black tracking-widest uppercase mt-0.5">Action Required</p>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-muted-foreground leading-normal font-medium">
                The AI Assistant is requesting approval to execute the following operation in your database:
              </p>
              <div className="p-4 bg-muted/40 border border-border rounded-2xl font-mono text-xs overflow-x-auto space-y-2">
                <p className="font-bold text-foreground">Tool: <span className="text-primary font-mono">{pendingApproval.toolName}</span></p>
                <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                  <p className="font-bold text-foreground mb-1">Arguments:</p>
                  <pre className="whitespace-pre-wrap leading-relaxed font-mono">{JSON.stringify(pendingApproval.args, null, 2)}</pre>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  pendingApproval.resolve(false);
                  setPendingApproval(null);
                }}
                className="flex-1 py-3 bg-muted hover:bg-muted/80 text-foreground font-bold rounded-xl text-xs uppercase tracking-wider transition-all"
              >
                Reject Action
              </button>
              <button
                onClick={() => {
                  pendingApproval.resolve(true);
                  setPendingApproval(null);
                }}
                className={`flex-1 py-3 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all hover:opacity-90 shadow-md ${pendingApproval.toolName.startsWith('delete_') ? 'bg-destructive shadow-destructive/20' : 'bg-primary shadow-primary/20'
                  }`}
              >
                Approve Action
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIChat;
