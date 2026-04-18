'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import {
  MessageSquare, X, Minimize2, Maximize2, Send,
  Paperclip, Loader2, ShieldCheck, TicketCheck, Mic,
} from 'lucide-react';
import { MessageBubble } from '@/components/widget/MessageBubble';
import type { ChatMessage } from '@/components/widget/types';

// ─── token palette — works on ANY page without .civic-app scope ────────────
const TOKENS: React.CSSProperties = {
  '--w-bg': '#ffffff',
  '--w-bg-light': '#f8fafc',
  '--w-primary': '#2563eb',
  '--w-primary-dark': '#1d4ed8',
  '--w-text': '#1e293b',
  '--w-muted': '#64748b',
  '--w-border': '#e2e8f0',
  '--w-accent': '#3b82f6',
  '--w-success': '#16a34a',
} as React.CSSProperties;

const CHAT_API_URL = '/api/chat';

const TENANT_ID =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_TENANT_ID) ||
  'pune-slug';

export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [attachment, setAttachment] = useState<{ url: string; name: string; type: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [inputValue, setInputValue] = useState('');
  const [isListening, setIsListening] = useState(false);
  const { messages, sendMessage, status } = useChat({
    api: CHAT_API_URL,
    body: { tenantId: TENANT_ID },
    initialMessages: [
      {
        id: 'welcome',
        role: 'assistant',
        parts: [{ type: 'text', text: "Hello! I'm your **CivicPulse AI Assistant** 🏙️\n\nI can help you:\n- Report civic issues (potholes, garbage, water leaks)\n- Track your existing complaints\n- Connect you with the right city department\n\nHow can I help your city today?" }],
      },
    ] as any,
    onData: (data: any) => {
      if (data?.suggestions) setSuggestions(data.suggestions);
    },
    onFinish: (message) => { 
      if (!isOpen) setHasUnread(true); 
      
      // Auto-TTS for the finished response
      if (typeof window !== 'undefined' && 'speechSynthesis' in window && message?.content) {
        // Cancel any currently playing speech
        window.speechSynthesis.cancel();
        
        // Strip markdown (bold, italic, list markers) so TTS speaks correctly
        const pureText = message.content.replace(/[*_#]/g, '');
        const utterance = new SpeechSynthesisUtterance(pureText);
        utterance.lang = 'en-US';
        
        const voices = window.speechSynthesis.getVoices();
        utterance.voice = voices.find(v => v.name.includes('Google') || v.name.includes('Female') || v.name.includes('Samantha') || v.name.includes('Zira')) || null;
        
        window.speechSynthesis.speak(utterance);
      }
    },
    onError: (e) => {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('<!DOCTYPE html>') || message.includes('404')) {
        console.error('[Chatbot] Chat endpoint returned HTML/404. Verify admin /api/chat proxy and ai-service port.', {
          chatApi: CHAT_API_URL,
          error: message.slice(0, 300),
        });
        return;
      }
      console.error('[Chatbot]', e);
    },
  });


  const isLoading = status === 'submitted' || status === 'streaming';

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
    }
  }, [inputValue]);

  // Escape key exits fullscreen
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isFullscreen]);

  const handleOpen = () => { setIsOpen(true); setHasUnread(false); };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (typeof ev.target?.result === 'string') {
        setAttachment({ url: ev.target.result, name: file.name, type: file.type });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const onSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    const text = inputValue.trim();
    if (!text && !attachment) return;
    setSuggestions([]);
    sendMessage({ text });
    setInputValue('');
    setAttachment(null);
  }, [inputValue, attachment, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(e as any); }
  };

  const startListening = () => {
    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Your browser does not support the Web Speech API');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = (e: any) => {
      console.error('Speech recognition error', e.error);
      setIsListening(false);
    };
    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setInputValue((prev) => prev ? prev + ' ' + transcript : transcript);
    };
    recognition.start();
  };

  // Map `ai` useChat messages to our ChatMessage type
  const chatMessages: ChatMessage[] = messages.map((m) => ({
    id: m.id,
    role: m.role as 'user' | 'assistant',
    content: m.content,
    createdAt: m.createdAt,
    parts: (m as any).parts,
  }));

  // ─── WINDOW SIZING ────────────────────────────────────────────────────────
  const windowStyle: React.CSSProperties = isFullscreen
    ? { position: 'fixed', inset: '1rem', maxWidth: '860px', margin: '0 auto', borderRadius: '20px' }
    : { position: 'fixed', bottom: '5.5rem', right: '1.5rem', width: '400px', maxHeight: '600px', borderRadius: '18px' };

  return (
    <div style={{ position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 9999, ...TOKENS }}>

      {/* ── FLOATING BUTTON ────────────────────────────────────────────────── */}
      {!isOpen && (
        <button
          onClick={handleOpen}
          aria-label="Open CivicPulse AI"
          style={{
            background: 'linear-gradient(135deg, var(--w-primary), var(--w-primary-dark))',
            color: 'white',
            border: 'none',
            borderRadius: '50px',
            padding: '0.875rem 1.5rem',
            boxShadow: '0 8px 30px rgba(37,99,235,0.35)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontWeight: 600,
            fontSize: '0.9rem',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.05)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
        >
          <MessageSquare size={20} />
          Ask AI
          {hasUnread && (
            <span style={{
              position: 'absolute', top: '-4px', right: '-4px',
              background: '#ef4444', borderRadius: '50%', width: '10px', height: '10px',
              border: '2px solid white',
            }} />
          )}
        </button>
      )}

      {/* ── CHAT WINDOW ────────────────────────────────────────────────────── */}
      {isOpen && (
        <div
          style={{
            ...windowStyle,
            background: 'var(--w-bg)',
            border: '1px solid var(--w-border)',
            boxShadow: '0 25px 70px rgba(0,0,0,0.18)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'slideUp 0.25s cubic-bezier(0.34,1.56,0.64,1)',
          }}
        >
          {/* HEADER */}
          <div style={{
            background: 'linear-gradient(135deg, #1d4ed8, #2563eb)',
            padding: '1rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '50%', padding: '6px', backdropFilter: 'blur(4px)' }}>
                <ShieldCheck size={18} color="white" />
              </div>
              <div>
                <div style={{ color: 'white', fontWeight: 700, fontSize: '0.95rem', fontFamily: 'Inter, system-ui' }}>
                  CivicPulse Assistant
                </div>
                <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.72rem', fontFamily: 'Inter, system-ui' }}>
                  ● Online · Civic Intelligence Platform
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setIsFullscreen(f => !f)} title={isFullscreen ? 'Minimize' : 'Expand'}
                style={headerBtnStyle}>
                {isFullscreen ? <Minimize2 size={15} color="white" /> : <Maximize2 size={15} color="white" />}
              </button>
              <button onClick={() => setIsOpen(false)} title="Close" style={headerBtnStyle}>
                <X size={15} color="white" />
              </button>
            </div>
          </div>

          {/* MESSAGES */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.85rem',
            background: '#f8fafc',
            backgroundImage: 'radial-gradient(at 100% 100%, rgba(37,99,235,0.06) 0px, transparent 60%)',
          }}>
            {chatMessages.map(msg => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {isLoading && (
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#eff6ff', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <ShieldCheck size={15} color="#2563eb" />
                </div>
                <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px 16px 16px 4px', padding: '0.65rem 0.9rem', display: 'flex', gap: '5px', alignItems: 'center' }}>
                  <span style={{ width: '7px', height: '7px', background: '#93c5fd', borderRadius: '50%', display: 'inline-block', animation: 'bounce 1.2s infinite' }} />
                  <span style={{ width: '7px', height: '7px', background: '#60a5fa', borderRadius: '50%', display: 'inline-block', animation: 'bounce 1.2s infinite 0.2s' }} />
                  <span style={{ width: '7px', height: '7px', background: '#3b82f6', borderRadius: '50%', display: 'inline-block', animation: 'bounce 1.2s infinite 0.4s' }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* SUGGESTION CHIPS */}
          {suggestions.length > 0 && !isLoading && (
            <div style={{ padding: '0.4rem 0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem', borderTop: '1px solid var(--w-border)', background: 'white', flexShrink: 0 }}>
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => { setInputValue(s); setSuggestions([]); }}
                  style={{
                    padding: '0.3rem 0.7rem',
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    borderRadius: '50px',
                    fontSize: '0.75rem',
                    color: '#1d4ed8',
                    cursor: 'pointer',
                    fontFamily: 'Inter, system-ui',
                    fontWeight: 500,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#dbeafe'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#eff6ff'; }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* INPUT */}
          <form onSubmit={onSubmit} style={{ padding: '0.75rem', background: 'white', borderTop: '1px solid var(--w-border)', display: 'flex', flexDirection: 'column', gap: '0.5rem', flexShrink: 0 }}>
            {/* File preview */}
            {attachment && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#f1f5f9', borderRadius: '8px', padding: '0.4rem 0.6rem', fontSize: '0.78rem', color: '#475569' }}>
                {attachment.type.startsWith('image') && (
                  <img src={attachment.url} alt="" style={{ width: '32px', height: '32px', objectFit: 'cover', borderRadius: '4px' }} />
                )}
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attachment.name}</span>
                <button type="button" onClick={() => setAttachment(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1rem', lineHeight: 1 }}>×</button>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
              {/* Hidden file input */}
              <input type="file" accept="image/*,video/*" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} />
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isLoading}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '0.5rem', borderRadius: '8px', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                title="Attach file">
                <Paperclip size={16} />
              </button>

              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder="Describe a civic issue..."
                disabled={isLoading}
                style={{
                  flex: 1,
                  resize: 'none',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '0.55rem 0.8rem',
                  fontSize: '0.875rem',
                  fontFamily: 'Inter, system-ui',
                  color: '#1e293b',
                  background: '#f8fafc',
                  outline: 'none',
                  maxHeight: '120px',
                  overflowY: 'auto',
                  lineHeight: 1.5,
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.1)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none'; }}
              />

              <button
                type="button"
                onClick={startListening}
                disabled={isLoading}
                title="Use Microphone"
                style={{
                  background: isListening ? '#f43f5e' : 'none',
                  border: isListening ? 'none' : '1px solid #e2e8f0',
                  borderRadius: '50%',
                  width: '38px',
                  height: '38px',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'all 0.2s',
                  color: isListening ? 'white' : '#64748b'
                }}
              >
                {isListening ? <Loader2 size={16} color="white" style={{ animation: 'spin 1s linear infinite' }} /> : <Mic size={16} />}
              </button>

              <button
                type="submit"
                disabled={isLoading || (!inputValue.trim() && !attachment)}
                style={{
                  background: (isLoading || (!inputValue.trim() && !attachment)) ? '#93c5fd' : '#2563eb',
                  border: 'none',
                  borderRadius: '50%',
                  width: '38px',
                  height: '38px',
                  cursor: (isLoading || (!inputValue.trim() && !attachment)) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'background 0.15s',
                }}
              >
                {isLoading
                  ? <Loader2 size={16} color="white" style={{ animation: 'spin 1s linear infinite' }} />
                  : <Send size={16} color="white" />
                }
              </button>
            </div>
          </form>

          {/* Footer hint */}
          <div style={{ textAlign: 'center', fontSize: '0.68rem', color: '#94a3b8', padding: '0.3rem 0.5rem 0.5rem', background: 'white', fontFamily: 'Inter, system-ui' }}>
            CivicPulse · SCIRP+ AI Civic Intelligence Network
          </div>
        </div>
      )}

      {/* ── KEYFRAME STYLES ────────────────────────────────────────────────── */}
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40%           { transform: translateY(-5px); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

const headerBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.15)',
  border: 'none',
  borderRadius: '8px',
  padding: '6px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'background 0.15s',
};
