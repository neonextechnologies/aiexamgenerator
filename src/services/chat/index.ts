import type { ChatContext, ChatMessage, ProposedAction } from '../../types/v2';
import type { ChatAssistant } from '../types';
import { isDemoMode, supabase } from '../../lib/supabase';
import { invokeEdgeFunction } from '../../lib/edge';

export const chatAssistant: ChatAssistant = {
  async send(sessionId, message, context) {
    const sid = sessionId || `chat-${Date.now()}`;
    const userMsg: ChatMessage = { id: `m-u-${Date.now()}`, role: 'user', content: message, created_at: new Date().toISOString() };

    if (!isDemoMode && supabase) {
      if (!sessionId) {
        await supabase.from('chat_sessions').insert({
          id: sid,
          user_id: (await supabase.auth.getUser()).data.user?.id || 'unknown',
          course_id: context.courseId || null,
          context_type: context.page || null,
          context_id: context.questionId || context.examId || null,
          title: message.slice(0, 60),
        });
      }
      await supabase.from('chat_messages').insert({ id: userMsg.id, session_id: sid, role: 'user', content: message });
    }

    let reply: ChatMessage = {
      id: `m-a-${Date.now()}`,
      role: 'assistant',
      content: buildLocalReply(message, context),
      created_at: new Date().toISOString(),
    };
    let proposedActions: ProposedAction[] = [];

    if (!isDemoMode) {
      try {
        const { ok, data } = await invokeEdgeFunction<{
          reply?: ChatMessage;
          proposedActions?: ProposedAction[];
          modelBased?: boolean;
          heuristicFallback?: boolean;
        }>('exam-engine', { action: 'chat', message, context, providerId: context.providerId });
        if (ok && data.reply) {
          reply = { ...data.reply, created_at: new Date().toISOString() };
          proposedActions = data.proposedActions || [];
        }
      } catch {
        // keep local labeled fallback
      }
    } else if (/สร้าง|generate|10 ข้อ|ข้อสอบ/i.test(message)) {
      proposedActions = [{
        id: `act-${Date.now()}`,
        action_type: 'open_generate_wizard',
        payload: { courseId: context.courseId },
        preview: 'เปิดตัวช่วยสร้างข้อสอบ (Hybrid/AI)',
        status: 'proposed',
      }];
    }

    if (!isDemoMode && supabase) {
      await supabase.from('chat_messages').insert({ id: reply.id, session_id: sid, role: 'assistant', content: reply.content, metadata_json: { proposedActions } });
      for (const a of proposedActions) {
        await supabase.from('chat_actions').insert({ id: a.id, session_id: sid, message_id: reply.id, action_type: a.action_type, payload_json: a.payload, status: 'proposed' });
      }
    }

    return { sessionId: sid, reply, proposedActions };
  },

  async confirmAction(actionId) {
    if (!isDemoMode && supabase) {
      await supabase.from('chat_actions').update({ status: 'confirmed', executed_at: new Date().toISOString() }).eq('id', actionId);
    }
    return { ok: true, result: { actionId, status: 'confirmed' } };
  },
};

function buildLocalReply(message: string, context: ChatContext): string {
  return [
    '[Heuristic fallback — โหมดสาธิตหรือไม่มี LLM]',
    'ผู้ช่วยออกแบบข้อสอบ (Controlled Hybrid)',
    `หน้า: ${context.page || '-'} | รายวิชา: ${context.courseId || '-'}`,
    '',
    `รับข้อความ: ${message}`,
    '',
    'โหมดที่แนะนำ:',
    '• Manual — สร้างข้อสอบเองที่ /questions/new โดยไม่เรียก AI',
    '• Hybrid — กำหนดโครงสร้างเอง แล้วให้ AI ช่วยร่างภายใต้ Rules + Evidence',
    '• AI — pipeline ควบคุมเต็มรูปแบบ (Retrieve → Analyze → Generate → Verify)',
    '',
    'ฉันจะเสนอ action ให้ยืนยันก่อนเปลี่ยนแปลงข้อมูลจริงเสมอ',
  ].join('\n');
}
