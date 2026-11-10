import { Badge, Button } from '@astryxdesign/core';
import { AstryxGallery } from './astryx-gallery';
import { useEffect, useState } from 'react';
import { builtinThemes, themePreferencesSchema, type ThemePreferences } from '../../shared/themes';
import { applyTheme, previewTheme } from '../settings/apply-appearance';
import {
  PageContainer,
  PageHeader,
  Section,
  Toolbar,
  ListRow,
  EmptyState,
  SettingRow,
  SegmentedControl,
  SegmentedControlItem,
} from '../components/ui';

const copy = {
  converter: 'Converter mode',
  converterHint: 'Choose how converters access downloads.',
  downloads: 'Downloads',
  offline: 'Offline',
  title: 'VStudy component gallery',
  description: 'UI_FOUNDATION_GALLERY_DEV_ONLY_2026',
  scheme: 'Scheme',
  theme: 'Theme pack',
  contrast: 'Contrast',
  structure: 'Rows and sections',
  empty: 'No documents yet',
  hint: 'Import a document to start studying.',
  action: 'Import document',
  back: 'Back to app',
  meta: 'Development preview',
  disabled: 'Disabled',
  selected: 'Selected',
  rest: 'Rest',
};
function Choice({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-[var(--space-2)]">
      <span>{label}</span>
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        {values.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}
const choices = (values: string[]) => values.map((value) => ({ value, label: value }));
export default function DesignGallery() {
  const [converterMode, setConverterMode] = useState('online');
  const [preferences, setPreferences] = useState(() =>
    themePreferencesSchema.parse({ colorScheme: 'light' }),
  );
  useEffect(() => {
    const root = document.documentElement;
    const style = root.getAttribute('style');
    const attributes = ['data-theme', 'data-scheme', 'class'].map(
      (name) => [name, root.getAttribute(name)] as const,
    );
    return () => {
      if (style === null) root.removeAttribute('style');
      else root.setAttribute('style', style);
      for (const [name, value] of attributes) {
        if (value === null) root.removeAttribute(name);
        else root.setAttribute(name, value);
      }
    };
  }, []);
  useEffect(() => {
    const restore = previewTheme(preferences);
    const query = matchMedia('(prefers-color-scheme: dark)');
    const update = () => applyTheme(preferences);
    query.addEventListener('change', update);
    return () => {
      query.removeEventListener('change', update);
      restore();
    };
  }, [preferences]);
  const change = <K extends keyof ThemePreferences>(key: K, value: ThemePreferences[K]) =>
    setPreferences((previous) => ({ ...previous, [key]: value }));
  const action = <Button label={copy.action} variant="primary" />;
  return (
    <main>
      <PageContainer data-gallery={copy.description}>
        <PageHeader
          title={copy.title}
          description={copy.description}
          leading={<a href="#/">{copy.back}</a>}
          actions={action}
          meta={copy.meta}
        />
        <Toolbar
          left={
            <Choice
              label={copy.scheme}
              value={preferences.colorScheme}
              values={choices(['system', 'light', 'dark'])}
              onChange={(value) => change('colorScheme', value as ThemePreferences['colorScheme'])}
            />
          }
          center={
            <Choice
              label={copy.theme}
              value={preferences.themeId}
              values={builtinThemes.map((pack) => ({ value: pack.id, label: pack.name }))}
              onChange={(value) => change('themeId', value)}
            />
          }
          right={
            <>
              <Choice
                label={copy.contrast}
                value={String(preferences.contrast)}
                values={choices(['100', '125', '150'])}
                onChange={(value) => change('contrast', Number(value))}
              />
            </>
          }
        />
        <AstryxGallery />
        <SettingRow label={copy.converter} description={copy.converterHint}>
        <SegmentedControl type="single" aria-label={copy.converter} value={converterMode} onValueChange={value => { if (value) setConverterMode(value); }}>
          <SegmentedControlItem value="online">{copy.downloads}</SegmentedControlItem>
          <SegmentedControlItem value="offline">{copy.offline}</SegmentedControlItem>
        </SegmentedControl>
      </SettingRow>
        <Section title={copy.structure} actions={action}>
          <ListRow
            leading={<Badge label="1" />}
            title={copy.rest}
            subtitle={copy.hint}
            meta={copy.meta}
            divider
            actions={<Button label={copy.action} variant="ghost" />}
          />
          <ListRow title={copy.selected} selected onClick={() => {}} />
          <ListRow title={copy.disabled} disabled onClick={() => {}} />
          <ListRow title={copy.back} href="#/design" />
          <EmptyState
            icon={<span aria-hidden="true">◇</span>}
            title={copy.empty}
            description={copy.hint}
            action={action}
          />
        </Section>
      </PageContainer>
    </main>
  );
}
