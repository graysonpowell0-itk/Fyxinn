import React, { useEffect, useRef, useState } from 'react';
import Anthropic from '@anthropic-ai/sdk';
import { Task } from '../../types';
import aiBotImage from '../../assets/ai-bot.png';

interface Props {
  openRepairs: Task[];
}

type Msg = { role: 'user' | 'assistant'; content: string };

const WELCOME = "Hi! I'm FyxBot. I can help you troubleshoot the repairs that are currently open. What do you need?";

const SYSTEM_PROMPT = `You are FyxBot, an expert hotel maintenance assistant for Fyxinn property management. You help hotel staff troubleshoot and handle maintenance issues quickly.

Your role:
- Give concise, actionable troubleshooting steps for common hotel maintenance issues (plumbing, HVAC, electrical, locks, appliances, etc.)
- Always prioritize guest safety — if there is any safety risk, tell staff to evacuate and contact maintenance immediately
- Keep answers brief and practical — staff are on the floor and need fast guidance
- Be friendly and professional
- If asked in Spanish or Hindi, respond in the same language`;

// Floating chat bubble — rendered only while at least one repair is open.
export const FyxBotChat: React.FC<Props> = ({ openRepairs }) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([{ role: 'assistant', content: WELCOME }]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [apiConfigured] = useState(() => {
    const key = import.meta.env.VITE_ANTHROPIC_API_KEY;
    return key && key !== 'your_anthropic_api_key_here';
  });
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, open]);

  const send = async () => {
    if (!input.trim() || thinking || streaming) return;
    const userMsg = input.trim();
    setInput('');
    const history = [...messages, { role: 'user' as const, content: userMsg }];
    setMessages(history);
    setThinking(true);

    if (!apiConfigured) {
      await new Promise(r => setTimeout(r, 500));
      setThinking(false);
      setMessages(prev => [...prev, { role: 'assistant', content: 'AI assistant is not configured yet. Please add your Anthropic API key to the .env file (VITE_ANTHROPIC_API_KEY) and rebuild the app.' }]);
      return;
    }

    try {
      const client = new Anthropic({
        apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
        dangerouslyAllowBrowser: true,
      });

      const repairContext = openRepairs.length > 0
        ? `\n\nCurrently open repairs:\n${openRepairs.map(r => `- ${r.roomNumber ? `Room ${r.roomNumber}: ` : ''}${r.description} (${r.priority} priority, ${r.status})`).join('\n')}`
        : '';

      const apiMessages = history
        .filter(m => m.content !== WELCOME)
        .map(m => ({ role: m.role, content: m.content }));

      setThinking(false);
      setStreaming(true);
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      const stream = await client.messages.stream({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: SYSTEM_PROMPT + repairContext,
        messages: apiMessages,
      });

      let fullText = '';
      for await (const chunk of stream.textStream) {
        fullText += chunk;
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: fullText };
          return updated;
        });
      }
    } catch {
      setThinking(false);
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I had trouble connecting. Please check your network and try again.' }]);
    } finally {
      setStreaming(false);
    }
  };

  return (
    <>
      {/* Floating bot button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="Ask FyxBot about open repairs"
          className="fixed bottom-24 right-5 z-40 w-14 h-14 rounded-full overflow-hidden border-2 border-cyan-400/60 shadow-[0_0_20px_rgba(0,193,253,0.45)] active:scale-90 transition-all bg-neutral-950"
        >
          <img src={aiBotImage} alt="FyxBot" className="w-full h-full object-cover" />
          <span className="absolute top-0.5 right-0.5 w-3 h-3 rounded-full bg-red-500 border border-white/40 flex items-center justify-center text-[7px] font-bold text-white">
            {openRepairs.length}
          </span>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed inset-x-3 bottom-24 top-20 z-50 flex flex-col rounded-xl overflow-hidden border border-cyan-400/30 bg-surface shadow-2xl max-w-md mx-auto">
          {/* Header */}
          <div className="shrink-0 border-b border-border bg-surface-2/90 px-4 py-2.5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 border border-cyan-400/40">
              <img src={aiBotImage} alt="FyxBot" className="w-full h-full object-cover" />
            </div>
            <div>
              <p className="text-[12px] font-grotesk font-bold text-gray-100">FyxBot</p>
              <p className="text-[9px] font-grotesk text-cyan-400 uppercase tracking-widest">
                {openRepairs.length} open repair{openRepairs.length === 1 ? '' : 's'}
              </p>
            </div>
            <button onClick={() => setOpen(false)} className="ml-auto text-gray-500 hover:text-gray-200 transition-colors">
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} gap-2`}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 border border-cyan-400/30 mt-0.5">
                    <img src={aiBotImage} alt="FyxBot" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className={`max-w-[78%] px-3 py-2 rounded-lg text-[12px] font-grotesk leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-primary/15 border border-primary/30 text-gray-100 rounded-tr-none'
                    : 'bg-surface-2 border border-border text-gray-200 rounded-tl-none'
                }`}>
                  {msg.content || (streaming && i === messages.length - 1 && (
                    <span className="flex gap-1 py-0.5">
                      {[0, 1, 2].map(j => (
                        <span key={j} className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: `${j * 150}ms` }} />
                      ))}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {thinking && (
              <div className="flex justify-start items-center gap-2">
                <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 border border-cyan-400/30">
                  <img src={aiBotImage} alt="FyxBot" className="w-full h-full object-cover" />
                </div>
                <div className="bg-surface-2 border border-border rounded-lg rounded-tl-none px-3 py-2 flex gap-1">
                  {[0, 1, 2].map(i => (
                    <span key={i} className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-border bg-surface-2/90 p-3 flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder="Ask about an open repair…"
              className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-gray-200 font-grotesk placeholder-gray-600 focus:outline-none focus:border-cyan-400"
            />
            <button
              onClick={send}
              disabled={!input.trim() || thinking || streaming}
              className="px-3 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-black rounded-lg transition-colors"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>send</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};
