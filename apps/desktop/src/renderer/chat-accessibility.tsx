import { useTranslation } from 'react-i18next';
import { useAuiState } from '@assistant-ui/react';
import { useState, useRef, useLayoutEffect, type FC } from 'react';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { plainText } from '../shared/plain-text';
import { copyAnswer } from './copy-answer';
import { documentCitationSchema } from '../shared';
import { tr } from '../shared/i18n';
import { TooltipIconButton } from './components/assistant-ui/elements/tooltip-icon-button';
export function ChatAnnouncement() {
  useTranslation();
  const announcement = useAuiState(s => {
    if (s.thread.isRunning) return tr('common:answer_streaming');
    const last = s.thread.messages.at(-1);
    if (!last || last.role !== 'assistant') return '';
    const text = last.content.filter(p => p.type === 'text').map(p => p.text).join('\n');
    const plain = plainText(text, documentCitationSchema.array().safeParse(last.metadata.custom.citations).data ?? []);
    return `${tr(last.status?.type === 'incomplete' ? last.status.reason === 'error' ? 'common:answer_error' : 'common:answer_stopped' : 'common:answer_complete')}: ${plain.slice(0,240).trimEnd()}${plain.length > 240 ? '…' : ''}`;
  });
  return <span data-testid="chat-announcement" role="status" aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</span>;
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

