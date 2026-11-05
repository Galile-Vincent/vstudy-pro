/** Offline, captioned workflow diagrams. Examples never call a school or AI provider. */
import { useEffect, useState } from 'react';
import { BookOpen, Check, GraduationCap, MessageCircle, Pause, Play, RotateCcw, Search, TextSelect } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { tr } from '../../shared/i18n';
import { Button } from '../components/ui/button';
import { markLearned } from './progress';
import './guidance.css';

export const lessons = ['school', 'due', 'agent', 'selection', 'history'] as const;
export type Lesson = typeof lessons[number];
const icons = { school: GraduationCap, due: BookOpen, agent: MessageCircle, selection: TextSelect, history: Search };

export function Walkthrough({ lesson }: { lesson: Lesson }) {
  useTranslation();
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => { setReduced(media.matches); if (media.matches) setPlaying(false); };
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (!playing || frame === 2) return;
    const timer = window.setTimeout(() => setFrame(value => value + 1), 5000);
    return () => clearTimeout(timer);
  }, [playing, frame]);
  useEffect(() => { if (frame === 2) { try { markLearned('walkthrough'); } catch { /* Watching remains available without storage. */ } } }, [frame]);
  const Icon = icons[lesson];
  return <section className="walkthrough" aria-label={tr(`onboarding:lesson_${lesson}`)} data-playing={playing && !reduced}>
    <p className="walkthrough-example">{tr('onboarding:example')}</p>
    <div className="walkthrough-window" aria-hidden="true">
      <div className="walkthrough-toolbar"><Icon size={18}/><strong>{tr(`onboarding:lesson_${lesson}`)}</strong></div>
      <div className="walkthrough-scene" data-frame={frame} key={lesson}>
        <div className="walkthrough-rail"><BookOpen size={18}/><MessageCircle size={18}/><Search size={18}/></div>
        <div className="walkthrough-scene-body">
          <strong>{tr(`onboarding:${lesson}_visual_${frame}`)}</strong>
          {lesson === 'school' && <><div className="walkthrough-field"><Search size={16}/>{tr('onboarding:example_school')}</div><div className="walkthrough-control" data-highlight={frame > 0}>{tr(frame === 2 ? 'onboarding:school_visual_2' : 'onboarding:school_visual_1')}</div></>}
          {lesson === 'due' && <><div className="walkthrough-tabs"><span>{tr('onboarding:due_visual_1')}</span><span data-highlight={frame === 2}>{tr('moodle:deadlines')}</span></div><div className="walkthrough-field" data-highlight={frame > 0}><BookOpen size={16}/>{tr('onboarding:example_deadline')}</div></>}
          {lesson === 'agent' && <><div className="walkthrough-bubble" data-highlight={frame > 0}>{tr('onboarding:example_deadline_question')}</div><div className="walkthrough-field"><MessageCircle size={16}/>{tr(frame === 2 ? 'onboarding:example_check_deadline' : 'onboarding:agent_visual_1')}</div></>}
          {lesson === 'selection' && <><p className="walkthrough-passage"><mark data-highlight={frame > 0}>{tr('onboarding:preview_passage')}</mark></p><div className="walkthrough-control" data-highlight={frame === 2}>{tr('common:ask_about_this')}</div></>}
          {lesson === 'history' && <><div className="walkthrough-field"><Search size={16}/>{frame === 2 ? tr('onboarding:example_search') : tr('common:search_threads')}</div><div className="walkthrough-control" data-highlight={frame === 2}>{tr('onboarding:example_chat_title')}</div></>}
        </div>
      </div>
      <div className="walkthrough-diagram">
        {[0, 1, 2].map(index => <div key={index} className="walkthrough-node" data-active={index === frame} data-done={index < frame}>
          <span>{index < frame ? <Check size={16}/> : index + 1}</span><strong>{tr(`onboarding:${lesson}_visual_${index}`)}</strong>
        </div>)}
      </div>
      <div className="walkthrough-track" key={frame}><span /></div>
    </div>
    <p className="walkthrough-caption" aria-live="polite">{tr('onboarding:caption_step', { current: frame + 1, total: 3 })} {tr(`onboarding:${lesson}_caption_${frame}`)}</p>
    <div className="learning-actions">
      <Button variant="outline" onClick={() => { if (frame === 2) { setFrame(0); setPlaying(true); } else setPlaying(value => !value); }}>{playing && frame < 2 ? <Pause size={16}/> : <Play size={16}/>}{tr(playing && frame < 2 ? 'onboarding:pause' : 'onboarding:play')}</Button>
      <Button variant="ghost" onClick={() => { setFrame(0); setPlaying(!reduced); }}><RotateCcw size={16}/>{tr('onboarding:replay_clip')}</Button>
      <Button variant="ghost" disabled={frame === 2} onClick={() => { setPlaying(false); setFrame(value => Math.min(2, value + 1)); }}>{tr('onboarding:next_caption')}</Button>
    </div>
    <details className="walkthrough-transcript" open={reduced || undefined}><summary>{tr('onboarding:all_instructions')}</summary><ol>{[0, 1, 2].map(index => <li key={index}>{tr(`onboarding:${lesson}_caption_${index}`)}</li>)}</ol></details>
  </section>;
}
