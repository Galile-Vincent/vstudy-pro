import { Button } from '../components/ui/button';
import { memo, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { GraduationCap, Microscope, Briefcase, Languages, FileText, TextSelect, Quote, Info, Terminal, KeyRound, Link2, Copy, Check, ArrowLeftRight } from 'lucide-react';
import { tr, systemLanguage } from '../../shared/i18n';
import type { Document } from '../../shared';
import { desktop } from '../bridge';
import { useNavigate } from '../shell';
import { DocumentMarkdown, ReplyMarkdown } from '../markdown';
import { Sparkline, Streak, type Dashboard } from '../home/home';
import { ProviderSettings, providerName, type Providers } from '../providers';
import { useCopyToClipboard } from '../hooks/use-copy-to-clipboard';
import { useReducedMotion } from '../motion/animated-text';
import { DemoPlayer, script, type DemoStep } from './demo-player';
import { SplitReveal } from './split-reveal';
import { facts, PROVIDER_KINDS, INTERFACE_LANGUAGES } from './facts';
import { useInView } from './use-in-view';
import { CountUp } from './count-up';
import { Marquee } from './marquee';
import './welcome.css';
import sampleEn from '../../../resources/samples/en.md?raw';
import sampleZh from '../../../resources/samples/zh-Hant.md?raw';
import sampleJa from '../../../resources/samples/ja.md?raw';
const samples = { en: sampleEn, 'zh-Hant': sampleZh, ja: sampleJa };
const MemoReader = memo(DocumentMarkdown);
const ignore = () => {};

const sections = ['hero', 'demo', 'values', 'who', 'models', 'data', 'start'] as const;
const sampleId = '00000000-0000-4000-8000-000000000000' as Document['id'];
const personaIcons = [GraduationCap, Microscope, Briefcase, Languages];
const commands = { 'claude-cli': 'claude auth login', 'codex-cli': 'codex login', 'agy-cli': 'agy' };
function Glass({ children, className = '' }: { children: ReactNode; className?: string }) {
  const pending = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(pending.current), []);
  return <div className={`w-glass ${className}`} onPointerMove={event => {
    if (pending.current || !matchMedia('(hover: hover) and (pointer: fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.reducedTransparency === 'true' || matchMedia('(prefers-reduced-transparency: reduce)').matches) return;
    const card = event.currentTarget, x = event.clientX, y = event.clientY;
    pending.current = setTimeout(() => { const bounds = card.getBoundingClientRect(); card.style.setProperty('--mx', `${x - bounds.left}px`); card.style.setProperty('--my', `${y - bounds.top}px`); pending.current = undefined; }, 16);
  }} onPointerLeave={() => { clearTimeout(pending.current); pending.current = undefined; }}>{children}</div>;
}
function Section({ id, children, active }: { id: typeof sections[number]; children: ReactNode; active: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const { visible, seen } = useInView(ref);
  return <section ref={ref} id={`welcome-${id}`} aria-labelledby={id === 'hero' ? 'welcome-title' : `w-${id}-title`} data-inview={visible} data-seen={seen} data-active={active}>{children}</section>;
}
function Heading({ id }: { id: string }) { return <div className="w-heading"><h2 id={`w-${id}-title`} tabIndex={-1}>{tr(`welcome:${id}_title`)}</h2><p>{tr(`welcome:${id}_body`)}</p></div>; }
function CitationChip() { return <span className="document-citation"><Quote size={12}/>{tr('welcome:demo_citation')}</span>; }
function Demo({ source, playing, reduced, side }: { source: string; playing: boolean; reduced: boolean; side: string }) {
  const stage = useRef<HTMLDivElement>(null);
  const { visible } = useInView(stage, .4);
  const [step, setStep] = useState<DemoStep>('enter');
  const player = useRef<DemoPlayer | null>(null);
  const wasReduced = useRef(reduced);
  useEffect(() => { player.current = new DemoPlayer(setStep); return () => player.current?.dispose(); }, []);
  useEffect(() => { if (reduced) player.current?.finish(); else { if (wasReduced.current) player.current?.replay(); player.current?.setPlaying(playing && visible); } wasReduced.current = reduced; }, [reduced, playing, visible]);
  const question = tr('welcome:demo_question');
  const graphemes = Intl.Segmenter ? [...new Intl.Segmenter(document.documentElement.lang || 'en', { granularity: 'grapheme' }).segment(question)].length : question.length;
  const index = script.findIndex(([name]) => name === step);
  useEffect(() => {
    const update = () => {
      const target = stage.current?.querySelector('.demo-reader-content [data-demo-depth="2"]');
      const content = stage.current?.querySelector('.demo-reader-content');
      const clip = stage.current?.querySelector('.w-reader-clip');
      if (target instanceof HTMLElement && content && clip) stage.current?.style.setProperty('--demo-jump', `${target.getBoundingClientRect().top-content.getBoundingClientRect().top+parseFloat(getComputedStyle(clip).paddingTop)}px`);
    };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    if (stage.current) observer?.observe(stage.current);
    const content=stage.current?.querySelector('.demo-reader-content');
    if(content) observer?.observe(content);
    return () => observer?.disconnect();
  }, [source]);
  useEffect(() => {
    const animations = stage.current?.getAnimations?.({ subtree: true }) ?? [];
    for (const animation of animations) {
      if (!playing || !visible) animation.pause();
      else if (animation.playState === 'paused') animation.play();
    }
  }, [playing, visible]);
  useEffect(() => {
    const heading = stage.current?.querySelector('.demo-reader-content [data-demo-depth="2"]');
    if (step === 'highlight') heading?.setAttribute('data-citation-highlight', '');
    else heading?.removeAttribute('data-citation-highlight');
  }, [step]);
  const caption = index < 1 || index > 10 ? 0 : index < 3 ? 1 : index < 5 ? 2 : index < 7 ? 3 : 4;
  return <><div className="w-demo-layout"><ol className="w-demo-steps" aria-label={tr('welcome:demo_steps_label')}>{[1, 2, 3, 4].map(n => <li key={n} data-active={caption === n}><span>{n}</span>{tr(`welcome:demo_step_${n}`)}</li>)}</ol>
    <div ref={stage} className="demo-stage" style={{ '--typing-duration': `${Math.min(1200, graphemes * 45)}ms`, '--typing-steps': graphemes } as CSSProperties} aria-hidden="true" inert data-step={step} data-index={index} data-playing={playing && visible && !reduced} data-side={side}>

      <div className="reading-pane w-demo-reader"><div className="pane-toolbar">{tr('welcome:sample_filename')}<small>{tr('welcome:sample_format')}</small></div><div className="w-reader-clip"><div className="demo-reader-content"><MemoReader decorative source={source} documentId={sampleId} onSelect={ignore} onNotice={ignore}/></div></div></div>
      <div className="w-demo-chat"><span className="w-demo-hint">{tr('welcome:demo_step_1')}</span><div className="aui-user-message-content w-demo-question">{tr('welcome:demo_question')}</div><div className="w-thinking"><span/><span/><span/></div><div className="aui-assistant-message-content w-demo-answer"><ReplyMarkdown text={tr('welcome:demo_answer')} revealWords/><CitationChip/></div><div className="w-demo-composer"><span className="selection-chip">{source.split('\n\n')[2]}</span><div className="w-draft"><p className="w-placeholder">{tr("common:ask_document_placeholder")}</p><p className="w-typed">{tr("welcome:demo_question")}</p></div><small>{tr('welcome:demo_model_chip')}</small></div></div>
    </div></div><div className="w-demo-footer"><span>{tr('welcome:example_badge')}</span><p><ArrowLeftRight size={16}/>{tr('welcome:demo_swap_hint')}</p><Button variant="outline" className="ghost w-replay" onClick={() => { player.current?.replay(); if (reduced) player.current?.finish(); else { if (wasReduced.current) player.current?.replay(); player.current?.setPlaying(playing && visible); } wasReduced.current = reduced; }}>{tr('welcome:demo_replay')}</Button></div></>;
}
function ProviderCard({ id }: { id: typeof PROVIDER_KINDS[number] }) {
  const { isCopied, copyToClipboard } = useCopyToClipboard();
  const cli = id in commands;
  const suffix = id === 'claude-cli' ? 'claude' : id === 'codex-cli' ? 'codex' : 'agy';
  const command = cli ? commands[id as keyof typeof commands] : '';
  const Icon = cli ? Terminal : id === 'openai-compatible' ? Link2 : KeyRound;
  return <Glass><Icon size={20}/><h3>{providerName[id]}</h3><p>{tr(`welcome:${cli ? 'via_cli' : id === 'openai-compatible' ? 'via_compatible' : 'via_key'}`)}</p>{cli ? <><p>{tr(`welcome:cmd_${suffix}`)}</p><div className="w-command"><code>{command}</code><Button variant="outline" className="ghost" aria-label={tr(isCopied ? 'common:copied' : 'common:copy')} onClick={() => copyToClipboard(command)}>{isCopied ? <Check size={16}/> : <Copy size={16}/>}</Button></div></> : <p>{tr(`welcome:key_${id === 'anthropic-api' ? 'anthropic' : id === 'openai-api' ? 'openai' : 'compatible'}`)}</p>}</Glass>;
}
export default function WelcomeView() {
  const { i18n } = useTranslation();
  const { navigate, closeWelcome } = useNavigate();
  useEffect(() => { const escape=(event:KeyboardEvent)=>{if(event.key === "Escape" && !document.querySelector("dialog[open]")) closeWelcome();}; window.addEventListener("keydown",escape); return ()=>window.removeEventListener("keydown",escape); },[closeWelcome]);
  const reduced = useReducedMotion();
  const language = systemLanguage(i18n.language);
  const [paused, setPaused] = useState(() => { try { return localStorage.getItem('vstudy-welcome-motion') === 'paused'; } catch { return false; } });
  const [hidden, setHidden] = useState(document.hidden);
  const [active, setActive] = useState<typeof sections[number]>('hero');
  const sample = samples[language];
  const [side, setSide] = useState('left');
  const [recent, setRecent] = useState<Document>();
  const [providers, setProviders] = useState<Providers>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    root.current?.querySelector<HTMLElement>('h1')?.focus();
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) setActive(entry.target.id.replace('welcome-', '') as typeof sections[number]);
    }, { root: root.current, rootMargin: '-45% 0px -45% 0px' });
    root.current?.querySelectorAll('.w-content>section').forEach(section => observer?.observe(section));
    const update = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', update);
    void desktop.invoke('settings:get', {}).then(s => { setSide(s.chatSide); if (!s.welcomeSeen) return desktop.invoke('settings:set', { ...s, welcomeSeen: true }); }).catch(() => setError(tr('errors:generic')));
    void desktop.invoke('dashboard:get', {}).then(d => setRecent(d.recentDocuments[0]?.document)).catch(() => setError(tr('errors:generic')));
    return () => { observer?.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, []);
  useEffect(() => {
    if (!paused) return;
    // Complete finite reading reveals; pause keeps looping motion and the demo in place.
    const finishReveals = () => {
      for (const animation of root.current?.getAnimations({ subtree: true }) ?? []) {
        const effect = animation.effect;
        const target = effect instanceof KeyframeEffect ? effect.target : null;
        if (target instanceof Element && target.closest('.demo-stage')) continue;
        if (effect?.getComputedTiming().iterations === 1 && typeof animation.currentTime === 'number') animation.finish();
      }
    };
    finishReveals();
    const observer = new MutationObserver(finishReveals);
    if (root.current) observer.observe(root.current, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-seen'] });
    return () => observer.disconnect();
  }, [paused, reduced]);
  const go = (id: typeof sections[number]) => { root.current?.querySelector(`#welcome-${id}`)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); root.current?.querySelector<HTMLElement>(id === 'hero' ? 'h1' : `#w-${id}-title`)?.focus({ preventScroll: true }); };
  const importDocument = async (sample: boolean) => {
    if (busy) return; setBusy(true); setError('');
    try { const doc = sample ? await desktop.invoke('documents:importSample', { language }) : await desktop.invoke('documents:import', {}); if (doc) { window.dispatchEvent(new Event('activity-updated')); navigate({ view: 'workspace', documentId: doc.id }); } }
    catch { setError(tr('errors:generic')); } finally { setBusy(false); }
  };
  const primary = () => recent ? navigate({ view: 'workspace', documentId: recent.id }) : void importDocument(false);
  const series: Dashboard['series'] = Array.from({ length: 14 }, (_, i) => ({ date: `2026-10-${String(i + 10).padStart(2, '0')}`, inputTokens: [3, 6, 2, 8, 4, 9, 5][i % 7]! * 100, outputTokens: 100, costUsd: 0, calls: 1 }));
  return <main ref={root} className="welcome" aria-label={tr('welcome:region_label')} data-motion={paused ? 'paused' : 'playing'} data-hidden={hidden || undefined} onKeyDown={e => { if (e.key === 'Tab' && !e.shiftKey && e.target === root.current?.querySelector('h1')) { e.preventDefault(); root.current?.querySelector<HTMLButtonElement>('#welcome-pause')?.focus(); } }} onScroll={e => { e.currentTarget.dataset.scrolled = String(e.currentTarget.scrollTop > 8); }}>
    <header className="w-header"><div><Button variant="outline" className="ghost" id="welcome-pause" aria-pressed={paused} onClick={() => { setPaused(!paused); try { localStorage.setItem('vstudy-welcome-motion', !paused ? 'paused' : 'playing'); } catch { /* Motion preference is optional when storage is unavailable. */ } }}>{tr('welcome:motion_pause')}</Button><Button variant="outline" className="ghost" onClick={closeWelcome}>{tr('welcome:close')}</Button></div></header>
    <nav className="w-progress" aria-label={tr('welcome:sections_label')}>{sections.map(id => <Button variant="outline" key={id} tabIndex={active === id ? 0 : -1} onKeyDown={event => { const direction = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0; if (direction) { event.preventDefault(); const next = sections[(sections.indexOf(id) + direction + sections.length) % sections.length]!; setActive(next); event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[sections.indexOf(next)]?.focus(); } }} aria-current={active === id ? 'true' : undefined} title={tr(`welcome:nav_${id}`)} aria-label={tr('welcome:go_to_section', { section: tr(`welcome:nav_${id}`) })} onClick={() => go(id)}><span/></Button>)}</nav>
    {error && <p role="alert">{error}</p>}
    <div className="w-content">{sections.map(id => <Section key={id} id={id} active={active === id}>
      {id === 'hero' && <div className="w-hero"><div><p className="w-eyebrow">{tr('welcome:hero_eyebrow')}</p><SplitReveal text={tr('welcome:hero_title')} language={language}/><p className="w-hero-body">{tr('welcome:hero_body')}</p><div className="w-actions"><Button variant="outline" className="primary" disabled={busy} onClick={primary}>{tr(recent ? 'home:continue' : 'home:upload')}</Button><Button variant="outline" className="secondary" onClick={() => go('demo')}>{tr('welcome:hero_secondary')}</Button></div></div><div className="hero-stack" role="img" aria-label={tr('welcome:hero_visual_alt')}><div aria-hidden="true"><Glass className="w-back"><span className="w-example">{tr('welcome:example_badge')}</span><FileText/><strong>{sample.split('\n')[0]?.replace(/^# /, '')}</strong></Glass><Glass className="w-middle"><mark>{tr('welcome:hero_excerpt')}</mark></Glass><Glass className="w-front"><p>{tr('welcome:hero_answer')}</p><CitationChip/></Glass></div></div></div>}
      {id !== 'hero' && <Heading id={id}/>}
      {id === 'values' && <><div className="w-grid w-values">{[FileText, TextSelect, Quote].map((Icon, i) => <Glass key={i}><Icon size={24}/><h3>{tr(`welcome:value_${i + 1}_title`)}</h3><p>{tr(`welcome:value_${i + 1}_body`)}</p></Glass>)}</div><dl className="w-facts" aria-label={tr('welcome:facts_label')}>{Object.entries(facts).map(([key, count]) => <div key={key}><dt><CountUp value={count} animate={active === 'values' && !reduced && !paused && !hidden}/></dt><dd>{tr(`welcome:fact_${key}`, { count })}{key === 'languages' && <p>{INTERFACE_LANGUAGES.map(lang => <span key={lang} lang={lang}>{new Intl.DisplayNames([lang], { type: 'language' }).of(lang)}{lang !== 'ja' && ' · '}</span>)}</p>}</dd></div>)}</dl></>}
      {id === 'demo' && <Demo source={sample} playing={!paused && !hidden} reduced={reduced} side={side}/>}
      {id === 'who' && <div className="w-grid w-personas">{[1, 2, 3, 4].map(n => { const Icon = personaIcons[n - 1]!; return <Glass key={n}><Icon size={24}/><h3>{tr(`welcome:p${n}_role`)}</h3><p>{tr(`welcome:p${n}_situation`)}</p><p>{tr(`welcome:p${n}_job`)}</p><div className="w-first"><strong>{tr('welcome:who_first_label')}</strong><p>{tr(`welcome:p${n}_first`)}</p></div></Glass>; })}</div>}
      {id === 'models' && <><Marquee/><div className="w-grid w-providers">{[...PROVIDER_KINDS].sort((a, b) => Number(b in commands) - Number(a in commands)).map(id => <ProviderCard key={id} id={id}/>)}</div><p className="w-note">{tr('welcome:models_note')}</p><Button variant="outline" className="secondary" onClick={() => { void desktop.invoke('providers:list', {}).then(p => { setProviders(p); setSettingsOpen(true); }).catch(() => setError(tr('errors:generic'))); }}>{tr('welcome:models_cta')}</Button></>}
      {id === 'data' && <><div className="w-data"><div>{['organise', 'track', 'private'].map(group => <div key={group}><h3>{tr(`welcome:data_${group}_title`)}</h3><ul>{Array.from({ length: group === 'private' ? 4 : 3 }, (_, i) => <li key={i}>{tr(`welcome:data_${group}_${i + 1}`)}</li>)}</ul></div>)}</div><div role="img" aria-label={tr('welcome:data_visual_alt')}><div className="w-data-examples" aria-hidden="true" inert><span className="w-badge">{tr('welcome:example_badge')}</span><div className="home-card"><Streak streak={{ current: 3, best: 5, today: true, days: series.slice(-7).map((d, i) => ({ date: d.date, studied: i !== 1 && i !== 3 })) }}/></div><div className="home-card"><p>{tr('welcome:example_usage')}</p><Sparkline series={series}/><p>{tr('home:budget', { percent: 42 })}</p><progress value={42} max={100}/></div></div></div></div><p className="w-good-to-know"><Info size={16}/><span><strong>{tr('welcome:good_to_know_label')}</strong> · {tr('welcome:good_to_know')}</span></p></>}
      {id === 'start' && <><div className="w-actions"><Button variant="outline" className="primary" disabled={busy} onClick={() => void importDocument(false)}>{tr('home:upload')}</Button><Button variant="outline" className="secondary" disabled={busy} onClick={() => void importDocument(true)}>{tr('onboarding:sample')}</Button></div><Button variant="outline" className="ghost" onClick={() => navigate('home')}>{tr('welcome:start_home')}</Button></>}
    </Section>)}</div>
    {settingsOpen && <ProviderSettings providers={providers} onClose={() => setSettingsOpen(false)} onRefresh={async () => setProviders(await desktop.invoke('providers:list', {}))}/>}
  </main>;
}
