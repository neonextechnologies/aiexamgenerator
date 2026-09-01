import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Check, MessageCircle, Send, X } from 'lucide-react';
import { chatAssistant } from '../../services';
import type { ChatContext, ChatMessage, ProposedAction } from '../../types/v2';

interface AssistantPanelProps {
  open: boolean;
  onClose: () => void;
  context: ChatContext;
}

export function AssistantPanel({ open, onClose, context }: AssistantPanelProps) {
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [actions, setActions] = useState<ProposedAction[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    const content = input.trim();
    if (!content || sending) return;
    const userMessage: ChatMessage = { id: `local-${Date.now()}`, role: 'user', content, created_at: new Date().toISOString() };
    setMessages(current => [...current, userMessage]);
    setInput('');
    setSending(true);
    setError('');
    try {
      const response = await chatAssistant.send(sessionId, content, context);
      setSessionId(response.sessionId);
      setMessages(current => [...current, response.reply]);
      setActions(current => [...current, ...response.proposedActions]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ผู้ช่วยไม่สามารถตอบกลับได้');
    } finally {
      setSending(false);
    }
  };

  const confirm = async (action: ProposedAction) => {
    const response = await chatAssistant.confirmAction(action.id);
    if (!response.ok) return;
    setActions(current => current.map(item => item.id === action.id ? { ...item, status: 'confirmed' } : item));
    if (action.action_type === 'open_generate_wizard') {
      const courseId = typeof action.payload.courseId === 'string' ? action.payload.courseId : context.courseId;
      navigate(courseId ? `/generate?courseId=${encodeURIComponent(courseId)}` : '/generate');
      onClose();
    }
  };

  if (!open) return null;

  return (
    <>
      <button aria-label="ปิดผู้ช่วย" className="fixed inset-0 bg-neutral-900/20 z-40" onClick={onClose} />
      <aside className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[400px] bg-white shadow-2xl border-l border-neutral-200 flex flex-col">
        <header className="flex items-center gap-3 p-4 border-b border-neutral-200"><div className="w-9 h-9 rounded-lg bg-primary-100 text-primary-700 flex items-center justify-center"><Bot className="w-5 h-5" /></div><div className="flex-1"><h2 className="font-semibold">ผู้ช่วยออกแบบข้อสอบ</h2><p className="text-xs text-neutral-500">เสนอแนะและขอยืนยันก่อนดำเนินการ</p></div><button aria-label="ปิด" onClick={onClose} className="p-2 rounded-lg hover:bg-neutral-100"><X className="w-5 h-5" /></button></header>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {!messages.length && <div className="rounded-lg bg-primary-50 p-4 text-sm text-primary-800"><p className="font-medium mb-1">สวัสดีครับ</p><p>ถามเรื่องการสร้างข้อสอบ เลือกโหมด หรือขอให้ช่วยเปิดตัวช่วยสร้างได้</p></div>}
          {messages.map(message => <div key={message.id} className={`max-w-[88%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${message.role === 'user' ? 'ml-auto bg-primary-600 text-white' : 'bg-neutral-100 text-neutral-800'}`}>{message.content}</div>)}
          {sending && <div className="text-sm text-neutral-400">กำลังตอบ...</div>}
          {actions.filter(action => action.status === 'proposed' || action.status === 'confirmed').map(action => <div key={action.id} className="border border-primary-200 bg-primary-50 rounded-lg p-3"><p className="text-sm font-medium">{action.preview}</p>{action.status === 'proposed' ? <button onClick={() => confirm(action)} className="btn-primary mt-3"><Check className="w-4 h-4" /> ยืนยัน</button> : <p className="text-xs text-success-700 mt-2">ยืนยันแล้ว</p>}</div>)}
          {error && <p className="text-sm text-error-600">{error}</p>}
        </div>
        <footer className="p-4 border-t border-neutral-200"><div className="flex gap-2"><textarea rows={2} value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }} className="input resize-none" placeholder="พิมพ์คำถาม..." /><button aria-label="ส่งข้อความ" disabled={!input.trim() || sending} onClick={send} className="btn-primary px-3"><Send className="w-4 h-4" /></button></div></footer>
      </aside>
    </>
  );
}

export function AssistantFab({ context }: { context: ChatContext }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button aria-label="เปิดผู้ช่วยออกแบบข้อสอบ" onClick={() => setOpen(true)} className="fixed right-5 bottom-5 z-30 w-14 h-14 rounded-full bg-primary-600 text-white shadow-lg hover:bg-primary-700 flex items-center justify-center"><MessageCircle className="w-6 h-6" /></button>
      <AssistantPanel open={open} onClose={() => setOpen(false)} context={context} />
    </>
  );
}
