import type { SuggestionAdapter } from '@assistant-ui/react';
import { tr } from '../shared/i18n';

const marker = 'i18n:';
const keys = ['common:which_passages_support_this_answer', 'common:explain_this_more_simply'];

export const followUpSuggestions: SuggestionAdapter = {
  generate: async () => keys.map(key => ({ prompt: marker + key })),
};

export const localizeSuggestion = (text: string) => text.startsWith(marker) ? tr(text.slice(marker.length)) : text;
