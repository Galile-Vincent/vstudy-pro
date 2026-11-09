import { useEffect, useState } from 'react';
import { builtinThemes, themePreferencesSchema, type ThemePreferences } from '../../shared/themes';
import { applyTheme, previewTheme } from '../settings/apply-appearance';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction, PageContainer, PageHeader, Section, Toolbar, ListRow, EmptyState, Stat, FormField, Tabs, TabsContent, SegmentedTabsList, SegmentedTabsTrigger, Button, Badge, Input, Separator, ToggleGroup, ToggleGroupItem } from '../components/ui';

const copy = { title: 'VStudy component gallery', description: 'UI_FOUNDATION_GALLERY_DEV_ONLY_2026', scheme: 'Scheme', theme: 'Theme pack', material: 'Material', contrast: 'Contrast', cards: 'Cards', structure: 'Rows and sections', forms: 'Fields', tabs: 'Segmented tabs', empty: 'No documents yet', hint: 'Import a document to start studying.', action: 'Import document', label: 'Course name', error: 'A course name is required', stats: 'Study time', unit: 'minutes', back: 'Back to app', meta: 'Development preview', disabled: 'Disabled', selected: 'Selected', rest: 'Rest', hover: 'Hover', focus: 'Focus' };
function Choice({ label, value, values, onChange }: { label: string; value: string; values: {value:string; label:string}[]; onChange:(value:string)=>void }) {
  return <label className="flex items-center gap-[var(--space-2)]"><span>{label}</span><select value={value} onChange={event => onChange(event.target.value)}>{values.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>;
}
const choices = (values:string[]) => values.map(value => ({value,label:value}));
export default function DesignGallery() {
  const [preferences, setPreferences] = useState(() => themePreferencesSchema.parse({colorScheme:'light'}));
  useEffect(() => {
    const root = document.documentElement;
    const style = root.getAttribute('style');
    const attributes = ['data-theme','data-scheme','data-card-transparency','class'].map(name => [name,root.getAttribute(name)] as const);
    return () => { if (style === null) root.removeAttribute('style'); else root.setAttribute('style',style); for (const [name,value] of attributes) { if(value === null) root.removeAttribute(name); else root.setAttribute(name,value); } };
  }, []);
  useEffect(() => {
    const restore = previewTheme(preferences);
    const query = matchMedia('(prefers-color-scheme: dark)');
    const update = () => applyTheme(preferences);
    query.addEventListener('change', update);
    return () => { query.removeEventListener('change', update); restore(); };
  }, [preferences]);
  const change = <K extends keyof ThemePreferences>(key:K,value:ThemePreferences[K]) => setPreferences(previous => ({...previous,[key]:value}));
  const action = <Button>{copy.action}</Button>;
  return <PageContainer data-gallery={copy.description}>
    <PageHeader title={copy.title} description={copy.description} leading={<a href="#/">{copy.back}</a>} actions={action} meta={copy.meta}/>
    <Toolbar left={<Choice label={copy.scheme} value={preferences.colorScheme} values={choices(['system','light','dark'])} onChange={value => change('colorScheme',value as ThemePreferences['colorScheme'])}/>} center={<Choice label={copy.theme} value={preferences.themeId} values={builtinThemes.map(pack => ({value:pack.id,label:pack.name}))} onChange={value => change('themeId',value)}/>} right={<><Choice label={copy.material} value={preferences.cardTransparency} values={choices(['solid','soft','glass'])} onChange={value => change('cardTransparency',value as ThemePreferences['cardTransparency'])}/><Choice label={copy.contrast} value={String(preferences.contrast)} values={choices(['100','125','150'])} onChange={value => change('contrast',Number(value))}/></>}/>
    <Section title={copy.cards} count={3}><div className="grid gap-[var(--space-4)] md:grid-cols-3">
      {(['flat','raised','interactive'] as const).map(variant => <Card key={variant} {...(variant === 'interactive' ? {variant, onClick:() => {}} : {variant})}><CardHeader><CardTitle>{variant}</CardTitle><CardDescription>{copy.hint}</CardDescription></CardHeader><CardContent><Stat label={copy.stats} value={42} unit={copy.unit} delta="+12%"/></CardContent>{variant !== 'interactive' && <CardFooter>{action}</CardFooter>}</Card>)}
      {(['rest','hover','focus','disabled'] as const).map(state => <Card key={state} variant="interactive" onClick={() => {}} disabled={state === 'disabled'} data-demo-state={state}><CardContent>{copy[state]}</CardContent></Card>)}
      <Card variant="interactive" href="#/design"><CardContent>{copy.back}</CardContent></Card>
    </div></Section>
    <Section title={copy.structure} actions={action}><ListRow leading={<Badge>1</Badge>} title={copy.rest} subtitle={copy.hint} meta={copy.meta} divider actions={<Button variant="ghost">{copy.action}</Button>}/><ListRow title={copy.selected} selected onClick={() => {}}/><ListRow title={copy.disabled} disabled onClick={() => {}}/><ListRow title={copy.back} href="#/design"/><EmptyState icon={<span aria-hidden="true">◇</span>} title={copy.empty} description={copy.hint} action={action}/></Section>
    <Section title={copy.forms}><FormField label={copy.label} description={copy.hint}>{props => <Input {...props}/>}</FormField><FormField label={copy.label} description={copy.hint} error={copy.error}>{props => <Input {...props}/>}</FormField><FormField label={copy.disabled}>{props => <Input {...props} disabled/>}</FormField></Section>
    <Section title={copy.tabs}><Tabs defaultValue="one"><SegmentedTabsList aria-label={copy.tabs}><SegmentedTabsTrigger value="one">{copy.rest}</SegmentedTabsTrigger><SegmentedTabsTrigger value="two">{copy.selected}</SegmentedTabsTrigger><SegmentedTabsTrigger value="three" disabled>{copy.disabled}</SegmentedTabsTrigger></SegmentedTabsList><TabsContent value="one">{copy.hint}</TabsContent><TabsContent value="two">{copy.meta}</TabsContent></Tabs></Section>
    <Section title={copy.action}><Toolbar left={<>{(['default','secondary','outline','ghost','link','destructive'] as const).map(variant => <Button key={variant} variant={variant}>{variant}</Button>)}</>} right={<Button disabled>{copy.disabled}</Button>}/><Separator/><ToggleGroup type="single" defaultValue="one" aria-label={copy.tabs}><ToggleGroupItem value="one">{copy.selected}</ToggleGroupItem><ToggleGroupItem value="two">{copy.rest}</ToggleGroupItem><ToggleGroupItem value="three" disabled>{copy.disabled}</ToggleGroupItem></ToggleGroup><Toolbar left={<>{(['default','secondary','outline','ghost','link','destructive'] as const).map(variant => <Badge key={variant} variant={variant}>{variant}</Badge>)}</>}/><Card><CardHeader><CardTitle>{copy.title}</CardTitle><CardAction>{action}</CardAction></CardHeader></Card></Section>
  </PageContainer>;
}
