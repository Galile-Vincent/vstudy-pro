import { BookOpen, MessageSquare, Quote } from 'lucide-react';
import { tr } from '../../shared/i18n';
export function ProductPreview() {
  return <div role="img" className="product-preview" aria-label={tr('onboarding:preview_label')}>
    <div className="pp-reader"><BookOpen aria-hidden="true"/><p>{tr('onboarding:preview_passage')}</p><mark>{tr('onboarding:preview_highlight')}</mark></div>
    <div className="pp-chat"><MessageSquare aria-hidden="true"/><strong className="pp-question">{tr('onboarding:preview_question')}</strong><p className="pp-answer">{tr('onboarding:preview_answer')}</p><small><Quote size={12} aria-hidden="true"/>{tr('onboarding:preview_citation')}</small></div>
  </div>;
}
