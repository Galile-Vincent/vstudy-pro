import { Brand } from '../components/brand';
import { Button, Card, IconButton } from '@astryxdesign/core';
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { GraduationCap, Microscope, Briefcase, Languages, FileText, TextSelect, Quote, Info, Terminal, KeyRound, Link2, Copy, Check, ArrowLeftRight, ArrowDown } from 'lucide-react';
import { tr, systemLanguage } from '../../shared/i18n';
import type { Document } from '../../shared';
import { desktop } from '../bridge';
import { useNavigate } from '../shell';
import { DocumentMarkdown, ReplyMarkdown } from '../markdown';
import { Sparkline, Streak, type Dashboard } from '../home/home';
import { ProviderSettings, providerName, type Providers } from '../providers';
import { useCopyToClipboard } from '../hooks/use-copy-to-clipboard';
import { facts, PROVIDER_KINDS, INTERFACE_LANGUAGES } from './facts';
import './welcome.css';
import sampleEn from '../../../resources/samples/en.md?raw';
import sampleZh from '../../../resources/samples/zh-Hant.md?raw';
import sampleJa from '../../../resources/samples/ja.md?raw';
const samples = { en: sampleEn, 'zh-Hant': sampleZh, ja: sampleJa };
const MemoReader = memo(DocumentMarkdown);
const ignore = () => {};
const interfaceLanguageNames = INTERFACE_LANGUAGES.map(language => ({ language, name: new Intl.DisplayNames([language], { type: 'language' }).of(language) }));

const sections = ['hero', 'demo', 'values', 'who', 'models', 'data', 'start'] as const;
const sampleId = '00000000-0000-4000-8000-000000000000' as Document['id'];
const personaIcons = [GraduationCap, Microscope, Briefcase, Languages];
const commands = { 'claude-cli': 'claude auth login', 'codex-cli': 'codex login', 'agy-cli': 'agy' };
function Section({ id, children, active }: { id: typeof sections[number]; children: ReactNode; active: boolean }) {
  return <section id={`welcome-${id}`} aria-labelledby={id === 'hero' ? 'welcome-title' : `w-${id}-title`} data-active={active}>{children}</section>;
}
function Heading({ id }: { id: string }) { return <div className="w-heading"><h2 id={`w-${id}-title`} tabIndex={-1}>{tr(`welcome:${id}_title`)}</h2><p>{tr(`welcome:${id}_body`)}</p></div>; }
function CitationChip() { return <span className="document-citation"><Quote size={12}/>{tr('welcome:demo_citation')}</span>; }
function Demo({ source, side }: { source: string; side: string }) {
  return <><div className="w-demo-layout"><ol className="w-demo-steps" aria-label={tr('welcome:demo_steps_label')}>{[1, 2, 3, 4].map(n => <li key={n}><span>{n}</span>{tr(`welcome:demo_step_${n}`)}</li>)}</ol>
    <div className="demo-stage" aria-hidden="true" inert data-side={side}>
      <div className="reading-pane w-demo-reader"><div className="pane-toolbar">{tr('welcome:sample_filename')}<small>{tr('welcome:sample_format')}</small></div><div className="w-reader-clip"><div className="demo-reader-content"><MemoReader decorative source={source} documentId={sampleId} onSelect={ignore} onNotice={ignore}/></div></div></div>
      <div className="w-demo-chat"><div className="aui-user-message-content w-demo-question">{tr('welcome:demo_question')}</div><div className="aui-assistant-message-content w-demo-answer"><ReplyMarkdown text={tr('welcome:demo_answer')}/><CitationChip/></div></div>
    </div></div><div className="w-demo-footer"><span>{tr('welcome:example_badge')}</span><p><ArrowLeftRight size={16}/>{tr('welcome:demo_swap_hint')}</p></div></>;
}
function ProviderCard({ id }: { id: typeof PROVIDER_KINDS[number] }) {
  const { isCopied, copyToClipboard } = useCopyToClipboard();
  const cli = id in commands;
  const suffix = id === 'claude-cli' ? 'claude' : id === 'codex-cli' ? 'codex' : 'agy';
  const command = cli ? commands[id as keyof typeof commands] : '';
  const Icon = cli ? Terminal : id === 'openai-compatible' ? Link2 : KeyRound;
  return <Card className="w-item"><Icon size={20}/><h3>{providerName[id]}</h3><p>{tr(`welcome:${cli ? 'via_cli' : id === 'openai-compatible' ? 'via_compatible' : 'via_key'}`)}</p>{cli ? <><p>{tr(`welcome:cmd_${suffix}`)}</p><div className="w-command"><code>{command}</code><IconButton variant="ghost" size="sm" label={tr(isCopied ? 'common:copied' : 'common:copy')} icon={isCopied ? <Check size={16}/> : <Copy size={16}/>} onClick={() => copyToClipboard(command)}/></div></> : <p>{tr(`welcome:key_${id === 'anthropic-api' ? 'anthropic' : id === 'openai-api' ? 'openai' : 'compatible'}`)}</p>}</Card>;
}
export default function WelcomeView() {
  const { i18n } = useTranslation();
  const { navigate, closeWelcome } = useNavigate();
  const language = systemLanguage(i18n.language);
  const [active, setActive] = useState<typeof sections[number]>('hero');
  const sample = samples[language];
  const [side, setSide] = useState('left');
  const [recent, setRecent] = useState<Document>();
  const [providers, setProviders] = useState<Providers>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => { const escape=(event:KeyboardEvent)=>{if(event.key === "Escape" && !settingsOpen && !event.defaultPrevented) closeWelcome();}; window.addEventListener("keydown",escape); return ()=>window.removeEventListener("keydown",escape); },[closeWelcome,settingsOpen]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    let focusFrame = requestAnimationFrame(() => { focusFrame = requestAnimationFrame(() => { if (!root.current?.contains(document.activeElement)) root.current?.querySelector<HTMLElement>('h1')?.focus({preventScroll:true}); }); });
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) setActive(entry.target.id.replace('welcome-', '') as typeof sections[number]);
    }, { root: root.current, rootMargin: '-45% 0px -45% 0px' });
    root.current?.querySelectorAll('.w-content>section').forEach(section => observer?.observe(section));
    void desktop.invoke('settings:get', {}).then(s => { setSide(s.chatSide); if (!s.welcomeSeen) return desktop.invoke('settings:set', { ...s, welcomeSeen: true }); }).catch(() => setError(tr('errors:generic')));
    void desktop.invoke('dashboard:get', {}).then(d => setRecent(d.recentDocuments[0]?.document)).catch(() => setError(tr('errors:generic')));
    return () => { cancelAnimationFrame(focusFrame); observer?.disconnect(); };
  }, []);
  const go = (id: typeof sections[number]) => { root.current?.querySelector(`#welcome-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); root.current?.querySelector<HTMLElement>(id === 'hero' ? 'h1' : `#w-${id}-title`)?.focus({ preventScroll: true }); };
  const rememberPractice = (documentId: Document['id']) => {
    try { sessionStorage.setItem('vstudy:practice', documentId); } catch { return; }
  };
  const importDocument = async (sample: boolean, practice = false) => {
    if (busy) return; setBusy(true); setError('');
    try { const doc = sample ? await desktop.invoke('documents:importSample', { language }) : await desktop.invoke('documents:import', {}); if (doc) { if (practice) rememberPractice(doc.id); window.dispatchEvent(new Event('activity-updated')); navigate({ view: 'workspace', documentId: doc.id }); } }
    catch { setError(tr('errors:generic')); } finally { setBusy(false); }
  };
  const primary = () => recent ? navigate({ view: 'workspace', documentId: recent.id }) : void importDocument(false);
  const series: Dashboard['series'] = Array.from({ length: 14 }, (_, i) => ({ date: `2026-10-${String(i + 10).padStart(2, '0')}`, inputTokens: [3, 6, 2, 8, 4, 9, 5][i % 7]! * 100, outputTokens: 100, costUsd: 0, calls: 1 }));
  return <main ref={root} className="welcome" aria-label={tr('welcome:region_label')}  onKeyDown={e => { if (e.key === 'Tab' && !e.shiftKey && e.target === root.current?.querySelector('h1')) { e.preventDefault(); root.current?.querySelector<HTMLButtonElement>('#welcome-close')?.focus(); } }}>
    <header className="w-header"><Brand lockup/><Button variant="ghost" size="sm" id="welcome-close" label={tr('welcome:close')} onClick={closeWelcome}/></header>
    <nav className="w-progress" aria-label={tr('welcome:sections_label')}>{sections.map(id => <button type="button" key={id} tabIndex={active === id ? 0 : -1} onKeyDown={event => { const direction = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0; if (direction) { event.preventDefault(); const next = sections[(sections.indexOf(id) + direction + sections.length) % sections.length]!; setActive(next); event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[sections.indexOf(next)]?.focus(); } }} aria-current={active === id ? 'true' : undefined} title={tr(`welcome:nav_${id}`)} aria-label={tr('welcome:go_to_section', { section: tr(`welcome:nav_${id}`) })} onClick={() => go(id)}><span/></button>)}</nav>
    {error && <p role="alert">{error}</p>}
    <div className="w-content">{sections.map(id => <Section key={id} id={id} active={active === id}>
      {id === 'hero' && <div className="w-hero"><p className="w-eyebrow">{tr('welcome:hero_eyebrow')}</p><h1 id="welcome-title" tabIndex={-1}>{tr('welcome:hero_title')}</h1><p className="w-hero-body">{tr('welcome:hero_body')}</p><div className="w-actions"><Button variant="primary" size="lg" label={tr(recent ? 'home:continue' : 'home:upload')} isDisabled={busy} onClick={primary}/><Button variant="ghost" size="lg" label={tr('welcome:hero_secondary')} endContent={<ArrowDown size={16} aria-hidden="true"/>} onClick={() => go('demo')}/></div><Card className="w-item w-hero-visual" role="img" aria-label={tr('welcome:hero_visual_alt')}><div aria-hidden="true"><span className="w-example">{tr('welcome:example_badge')}</span><mark>{tr('welcome:hero_excerpt')}</mark><p>{tr('welcome:hero_answer')}</p><CitationChip/></div></Card></div>}
      {id !== 'hero' && <Heading id={id}/>}
      {id === 'values' && <><div className="w-grid w-values">{[FileText, TextSelect, Quote].map((Icon, i) => <Card className="w-item" key={i}><Icon size={24}/><h3>{tr(`welcome:value_${i + 1}_title`)}</h3><p>{tr(`welcome:value_${i + 1}_body`)}</p></Card>)}</div><dl className="w-facts" aria-label={tr('welcome:facts_label')}>{Object.entries(facts).map(([key, count]) => <div key={key}><dt>{count}</dt><dd>{tr(`welcome:fact_${key}`, { count })}{key === 'languages' && <p>{interfaceLanguageNames.map(({language,name}) => <span key={language} lang={language}>{name}{language !== 'ja' && ' · '}</span>)}</p>}</dd></div>)}</dl></>}
      {id === 'demo' && <><Demo source={sample} side={side}/><h3>{tr('welcome:try_title')}</h3><p>{tr('welcome:try_steps')}</p><Button variant="secondary" label={tr('welcome:try_open')} isDisabled={busy} onClick={() => { void importDocument(true, true); }}/></>}
      {id === 'who' && <div className="w-grid w-personas">{[1, 2, 3, 4].map(n => { const Icon = personaIcons[n - 1]!; return <Card className="w-item" key={n}><Icon size={24}/><h3>{tr(`welcome:p${n}_role`)}</h3><p>{tr(`welcome:p${n}_situation`)}</p><p>{tr(`welcome:p${n}_job`)}</p><div className="w-first"><strong>{tr('welcome:who_first_label')}</strong><p>{tr(`welcome:p${n}_first`)}</p></div></Card>; })}</div>}
      {id === 'models' && <><div className="w-grid w-providers">{[...PROVIDER_KINDS].sort((a, b) => Number(b in commands) - Number(a in commands)).map(id => <ProviderCard key={id} id={id}/>)}</div><p className="w-note">{tr('welcome:models_note')}</p><Button variant="secondary" label={tr('welcome:models_cta')} onClick={() => { void desktop.invoke('providers:list', {}).then(p => { setProviders(p); setSettingsOpen(true); }).catch(() => setError(tr('errors:generic'))); }}/></>}
      {id === 'data' && <><div className="w-data"><div>{['organise', 'track', 'private'].map(group => <div key={group}><h3>{tr(`welcome:data_${group}_title`)}</h3><ul>{Array.from({ length: group === 'private' ? 4 : 3 }, (_, i) => <li key={i}>{tr(`welcome:data_${group}_${i + 1}`)}</li>)}</ul></div>)}</div><div role="img" aria-label={tr('welcome:data_visual_alt')}><div className="w-data-examples" aria-hidden="true" inert><span className="w-badge">{tr('welcome:example_badge')}</span><div className="home-card"><Streak streak={{ current: 3, best: 5, today: true, days: series.slice(-7).map((d, i) => ({ date: d.date, studied: i !== 1 && i !== 3 })) }}/></div><div className="home-card"><p>{tr('welcome:example_usage')}</p><Sparkline series={series}/><p>{tr('home:budget', { percent: 42 })}</p><progress value={42} max={100}/></div></div></div></div><p className="w-good-to-know"><Info size={16}/><span><strong>{tr('welcome:good_to_know_label')}</strong> · {tr('welcome:good_to_know')}</span></p></>}
      {id === 'start' && <><div className="w-actions"><Button variant="primary" size="lg" label={tr('home:upload')} isDisabled={busy} onClick={() => void importDocument(false)}/><Button variant="secondary" size="lg" label={tr('onboarding:sample')} isDisabled={busy} onClick={() => void importDocument(true)}/></div><Button variant="ghost" label={tr('welcome:start_home')} onClick={() => navigate('home')}/></>}
    </Section>)}</div>
    {settingsOpen && <ProviderSettings providers={providers} onClose={() => setSettingsOpen(false)} onRefresh={async () => setProviders(await desktop.invoke('providers:list', {}))}/>}
  </main>;
}
