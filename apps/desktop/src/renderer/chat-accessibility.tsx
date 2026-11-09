import { useTranslation } from 'react-i18next';
import { useAuiState } from '@assistant-ui/react';
import { useState, useRef, useLayoutEffect, useEffect, type FC } from 'react';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { plainText } from '../shared/plain-text';
import { copyAnswer } from './copy-answer';
import { documentCitationSchema } from '../shared';
import { tr } from '../shared/i18n';
import { TooltipIconButton } from './components/assistant-ui/elements/tooltip-icon-button';
const EXCERPT_LIMIT = 240;
export function announcementExcerpt(plain: string): string {
  const units = typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(plain), part => part.segment)
    : Array.from(plain);
  return `${units.slice(0, EXCERPT_LIMIT).join('').trimEnd()}${units.length > EXCERPT_LIMIT ? '…' : ''}`;
}
export function ChatAnnouncement() {
  useTranslation();
  const announcement = useAuiState(s => {
    if (s.thread.isRunning) return tr('common:answer_streaming');
    const last = s.thread.messages.at(-1);
    if (!last || last.role !== 'assistant') return '';
    const text = last.content.filter(p => p.type === 'text').map(p => p.text).join('\n');
    const plain = plainText(text, documentCitationSchema.array().safeParse(last.metadata.custom.citations).data ?? []);
    return `${tr(last.status?.type === 'incomplete' ? last.status.reason === 'error' ? 'common:answer_error' : 'common:answer_stopped' : 'common:answer_complete')}: ${announcementExcerpt(plain)}`;
  });
  return <><ToolAnnouncement/><span data-testid="chat-announcement" role="status" aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</span></>;
}

export const CopyAnswerButton: FC = () => {
  useTranslation();
  const text = useAuiState(s => s.message.content.filter(p => p.type === 'text').map(p => p.text).join('\n'));
  const raw = useAuiState(s => s.message.metadata.custom.citations);
  const [copied,setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useLayoutEffect(() => () => clearTimeout(timer.current), []);
  return <TooltipIconButton tooltip={tr('common:copy')} onClick={() => {
    const parsed = documentCitationSchema.array().safeParse(raw);
    void navigator.clipboard.writeText(copyAnswer(text, parsed.success ? parsed.data : [])).then(() => {setCopied(true);clearTimeout(timer.current);timer.current = setTimeout(() => setCopied(false),2000);});
  }}>{copied ? <CheckIcon /> : <CopyIcon />}</TooltipIconButton>;
};


export function ToolAnnouncement() {
  useTranslation();
  const running = useAuiState(state => state.thread.isRunning);
  const message = useAuiState(state => state.thread.messages.at(-1));
  const tracked = useRef<{id: string | undefined; active: boolean; seen: Map<string, string>} | null>(null);
  const sequence = useRef(0);
  const [entries, setEntries] = useState<{id: number; text: string}[]>([]);
  useEffect(() => {
    const initial = tracked.current === null;
    if (!tracked.current || tracked.current.id !== message?.id) {
      tracked.current = {id: message?.id, active: false, seen: new Map()};
    }
    const current = tracked.current;
    if (running) current.active = true;
    const announcements: {id: number; text: string}[] = [];
    if (message?.role === 'assistant') for (const part of message.content) {
      if (part.type !== 'tool-call') continue;
      const status = part.isError ? 'failed' : part.result !== undefined ? 'finished'
        : message.status?.type === 'incomplete'
          ? message.status.reason === 'cancelled' ? 'cancelled' : 'failed'
        : message.status?.type === 'running' ? 'started' : 'waiting';
      const previous = current.seen.get(part.toolCallId);
      current.seen.set(part.toolCallId, status);
      if (initial || !current.active || previous === status) continue;
      announcements.push({id: sequence.current++, text: tr(`common:tool_${status}`, {tool: part.toolName})});
    }
    if (announcements.length) setEntries(entries => [...entries, ...announcements].slice(-5));
  }, [message, running]);
  return <div data-testid="tool-announcement" role="log" aria-live="polite"
    aria-relevant="additions" className="sr-only">
    {entries.map(entry => <div key={entry.id}>{entry.text}</div>)}
  </div>;
}
