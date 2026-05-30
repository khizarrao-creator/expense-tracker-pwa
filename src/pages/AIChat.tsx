import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles, Send, Trash2, ArrowLeft, Bot, User,
  HelpCircle, Loader2, RefreshCw, AlertTriangle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '../contexts/CurrencyContext';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

import { getCachedSnapshot, invalidateAICache, type FinancialSnapshot } from '../services/aiDataService';
import {
  loadSession, saveMessage, clearSession, sendToGemini,
  type ChatMessage
} from '../services/aiChatService';

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

const MessageBubble: React.FC<{ msg: ChatMessage; isLatest: boolean }> = ({ msg }) => {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex items-end gap-2.5 ${isUser ? 'justify-end' : 'justify-start'} 
      animate-in fade-in slide-in-from-bottom-2 duration-300`}>
      {!isUser && (
        <div className="shrink-0 w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
          <Bot size={15} />
        </div>
      )}

      <div className={`max-w-[82%] rounded-2xl px-4 py-3 shadow-sm border ${
        isUser
          ? 'bg-primary text-primary-foreground border-primary/30 rounded-br-sm'
          : 'bg-card text-foreground border-border rounded-bl-sm'
      }`}>
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

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

  // Session
  const [sessionId] = useState<string>(() => {
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

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    loadSnapshot();
    loadChatSession();
  }, [loadSnapshot, loadChatSession]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // ── Send message ─────────────────────────────────────────────────────────

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    if (!apiKey) {
      toast.error('Gemini API Key is missing. Add VITE_GEMINI_API_KEY to your .env file.');
      return;
    }
    if (!snapshot) {
      toast.error('Financial data is still loading. Please wait a moment.');
      return;
    }

    const userMsg: ChatMessage = {
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInputValue('');
    setIsLoading(true);

    // Save user message to Firestore
    if (user) {
      await saveMessage(user.uid, sessionId, userMsg);
    }

    try {
      const responseText = await sendToGemini(
        updatedMessages,
        snapshot,
        globalCurrency.code,
        globalCurrency.symbol,
        apiKey
      );

      const modelMsg: ChatMessage = {
        role: 'model',
        content: responseText,
        timestamp: new Date().toISOString(),
      };

      setMessages(prev => [...prev, modelMsg]);

      // Save model response to Firestore
      if (user) {
        await saveMessage(user.uid, sessionId, modelMsg);
      }
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        role: 'model',
        content: `⚠️ **Error:** ${err.message || 'Could not reach the AI model. Please check your connection and API key.'}`,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMsg]);
      toast.error('AI request failed. Check console for details.');
    } finally {
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
    <div className="flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-4rem)] max-w-4xl mx-auto bg-card rounded-2xl border border-border overflow-hidden shadow-sm">

      {/* ── Header ── */}
      <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/more')}
            className="p-2 hover:bg-muted rounded-xl transition-colors text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-primary/10 text-primary rounded-xl">
              <Sparkles size={18} />
            </div>
            <div>
              <h2 className="text-sm font-black tracking-tight leading-none">AI Financial Copilot</h2>
              <p className="text-[10px] text-muted-foreground font-bold mt-0.5 uppercase tracking-widest flex items-center gap-1">
                {snapshotLoading ? (
                  <><Loader2 size={9} className="animate-spin" /> Syncing data…</>
                ) : snapshotError ? (
                  <span className="text-destructive"><AlertTriangle size={9} className="inline mr-0.5" />Data error</span>
                ) : (
                  <>Gemini Flash · Data synced {snapshot ? new Date(snapshot.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</>
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
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

      {/* ── Chat Body ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

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
          />
        ))}

        {/* Typing indicator */}
        {isLoading && <TypingIndicator />}

        <div ref={chatEndRef} />
      </div>

      {/* ── Input Area ── */}
      <div className="p-4 border-t border-border shrink-0 bg-card">
        {!apiKey && (
          <div className="mb-3 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-xl text-xs font-semibold flex items-center gap-2">
            <AlertTriangle size={14} />
            Gemini API Key is missing. Add <code className="font-mono bg-destructive/10 px-1 rounded">VITE_GEMINI_API_KEY</code> to your <code className="font-mono">.env</code> file.
          </div>
        )}

        <form
          onSubmit={e => { e.preventDefault(); handleSend(inputValue); }}
          className="flex gap-2"
        >
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
                : 'Ask about your finances…'
            }
            className="flex-1 px-4 py-3 bg-muted/40 border border-border rounded-xl text-sm font-medium focus:bg-background focus:border-primary outline-none transition-all disabled:opacity-50 placeholder:text-muted-foreground/60"
          />
          <button
            type="submit"
            disabled={isLoading || !inputValue.trim() || !apiKey || snapshotLoading}
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
  );
};

export default AIChat;
