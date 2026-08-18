import React, { useState, useEffect, useRef } from 'react';
import { useWork } from '../../contexts/WorkContext';
import { sendToGeminiStream } from '../../services/aiChatService';
import { Sparkles, Send, Bot, User, BookOpen, Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
}

export const ProjectAIChat: React.FC = () => {
  const { selectedProject } = useWork();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [knowledgeBaseText, setKnowledgeBaseText] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedProject) {
      const savedKb = localStorage.getItem(`project_kb_${selectedProject.id}`) || '';
      setKnowledgeBaseText(savedKb);
      setMessages([
        {
          id: 'welcome',
          sender: 'ai',
          text: `Hello! I am the AI Copilot for **${selectedProject.name}**. Ask me anything about project tasks, CRM leads, or team guidelines.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    }
  }, [selectedProject]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isStreaming || !selectedProject) return;

    const userText = inputText.trim();
    setInputText('');

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      sender: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);

    const aiMsgId = `ai_${Date.now()}`;
    const initialAiMsg: ChatMessage = {
      id: aiMsgId,
      sender: 'ai',
      text: '',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages(prev => [...prev, initialAiMsg]);

    const systemPrompt = `You are the specialized AI Assistant for project "${selectedProject.name}".
Description: ${selectedProject.description || 'N/A'}.
Project Knowledge Base Context:
${knowledgeBaseText || 'No custom knowledge base specified.'}

Answer user queries accurately adhering strictly to this project's context.`;

    const chatHistory = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      ...messages.filter(m => m.id !== 'welcome').map(m => ({
        role: m.sender === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }]
      })),
      { role: 'user', parts: [{ text: userText }] }
    ];

    try {
      let fullText = '';
      await sendToGeminiStream(chatHistory, (chunk) => {
        fullText += chunk;
        setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: fullText } : m));
      });
    } catch (err: any) {
      console.error(err);
      toast.error('AI response error');
    } finally {
      setIsStreaming(false);
    }
  };

  if (!selectedProject) return null;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-foreground flex items-center gap-2">
            <Sparkles className="text-primary" size={20} /> Project AI Knowledge Copilot
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Contextual AI configured specifically for project {selectedProject.name}.
          </p>
        </div>
      </div>

      {/* Chat Messages Container */}
      <div className="border border-border rounded-3xl bg-card shadow-xs flex flex-col h-[500px] overflow-hidden">
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {messages.map(m => (
            <div key={m.id} className={`flex gap-3 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.sender === 'ai' && (
                <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold flex-shrink-0">
                  <Bot size={18} />
                </div>
              )}

              <div className={`max-w-[75%] p-4 rounded-2xl text-xs leading-relaxed ${
                m.sender === 'user'
                  ? 'bg-primary text-primary-foreground font-medium rounded-tr-none'
                  : 'bg-muted/60 border border-border text-foreground rounded-tl-none'
              }`}>
                <p className="whitespace-pre-wrap">{m.text}</p>
                <span className="text-[9px] opacity-60 mt-1 block text-right font-mono">{m.timestamp}</span>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSendMessage} className="p-4 bg-muted/40 border-t border-border flex gap-2">
          <input
            type="text"
            placeholder={`Ask about ${selectedProject.name}...`}
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            disabled={isStreaming}
            className="flex-1 bg-card border border-border rounded-2xl px-4 py-3 text-xs outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="submit"
            disabled={isStreaming || !inputText.trim()}
            className="bg-primary text-primary-foreground px-5 rounded-2xl font-bold text-xs flex items-center gap-1.5 disabled:opacity-50"
          >
            {isStreaming ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </form>
      </div>
    </div>
  );
};
