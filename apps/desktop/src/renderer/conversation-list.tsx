/** Scoped entry into the shared History finder. Titles and actions live in SQLite. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { tr } from '../shared/i18n';
import type { Conversation } from '../shared';
import { desktop } from './bridge';
import { useOptionalNavigation } from './shell';
import { HistorySearch } from './history/search';
import { Dialog, DialogHeader } from '@astryxdesign/core';
export function ConversationList({ current, onSelect, onNew, canCreate }: {
  current: Conversation | null;
  onSelect: (conversation: Conversation, messageId?: string) => void;
  onNew: () => Promise<void>;
  canCreate: boolean;
}) {
  useTranslation();
  const navigation = useOptionalNavigation();
  const [open, setOpen] = useState(false), [error, setError] = useState(false);
  return <><button aria-label={tr('common:conversations')} className="conversation-trigger" onClick={() => setOpen(true)}><span>{tr('common:conversations')}</span><ChevronDown size={12}/></button>
  <Dialog isOpen={open} onOpenChange={setOpen} className="history-dialog" aria-label={tr('history:title')}><DialogHeader title={tr('history:title')} subtitle={tr('history:subtitle')} onOpenChange={setOpen} />
   {canCreate && <button onClick={() => { void onNew().then(() => setOpen(false)).catch(() => setError(true)); }}>{tr('common:new_chat')}</button>}
   {error && <p role="alert">{tr('history:error')}</p>}
   <HistorySearch compact documentId={current?.scope !== 'course' && current?.scope !== 'general' ? current?.documentId : undefined} courseId={current?.scope === 'course' ? current.courseId : undefined} onOpen={(hit, messageId) => {
      const sameScope = current && (current.scope === 'course' ? hit.scope === 'course' && hit.courseId === current.courseId : current.scope === 'general' ? hit.scope === 'general' : hit.scope === 'document' && hit.documentId === current.documentId);
      if (!sameScope && navigation) {
        setOpen(false);
        navigation.navigate({view:'history',conversationId:hit.id,messageId});
        return;
      }
      void desktop.invoke('chats:get', { conversationId: hit.id }).then(c => { if (c) {
        onSelect(c, messageId);
        setOpen(false);
      } }).catch(() => setError(true));
    }}/>
  </Dialog>
 </>;
}
