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


function ToolAnnouncement() {
  useTranslation();
  const running = useAuiState(state => state.thread.isRunning);
  const activeMessageId = useAuiState(state => state.thread.isRunning ? state.thread.messages.at(-1)?.id : undefined);
  const tools = useAuiState(state => JSON.stringify(state.thread.messages.flatMap(message =>
    message.role !== 'assistant' ? [] : message.content.flatMap(part => {
      if (part.type !== 'tool-call') return [];
      const status = part.isError ? 'failed' : part.result !== undefined ? 'finished'
        : message.status?.type === 'incomplete' ? 'failed'
        : message.status?.type === 'running' ? 'started' : 'finished';
      return [{id: `${message.id}:${part.toolCallId}`, messageId: message.id, name: part.toolName, status}];
    }))));
  const seen = useRef<Map<string, string> | null>(null);
  const active = useRef(new Set<string>());
  const [entries, setEntries] = useState<string[]>([]);
  useEffect(() => {
    const current = JSON.parse(tools) as {id: string; messageId: string; name: string; status: string}[];
    if (!seen.current) {
      seen.current = new Map(current.map(tool => [tool.id, tool.status]));
      return;
    }
    if (activeMessageId) active.current.add(activeMessageId);
    const announcements: string[] = [];
    for (const tool of current) {
      const previous = seen.current.get(tool.id);
      if (previous === tool.status) continue;
      seen.current.set(tool.id, tool.status);
      if (!running && !active.current.has(tool.messageId)) continue;
      active.current.add(tool.messageId);
      announcements.push(tr(`common:tool_${tool.status}`, {tool: tool.name}));
    }
    if (announcements.length) setEntries(entries => [...entries, ...announcements]);
  }, [tools, running, activeMessageId]);
  return <div data-testid="tool-announcement" role="log" aria-live="polite"
    aria-relevant="additions" className="sr-only">
    {entries.map((entry, index) => <div key={index}>{entry}</div>)}
  </div>;
}
