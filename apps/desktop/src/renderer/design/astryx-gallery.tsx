import { useState } from 'react';
import {
  AlertDialog, Badge, Button, Card, CheckboxInput, Dialog, DialogHeader, DropdownMenu, IconButton, Selector, Tooltip,
  Tab, TabList, TextArea, TextInput, Switch, SegmentedControl, SegmentedControlItem, SideNav, SideNavSection, SideNavItem,
} from '@astryxdesign/core';
import { BookOpen, CalendarDays, Settings } from 'lucide-react';

const copy = {
  section: 'Astryx components', title: 'Astryx 0.7.11 · Neutral', navigation: 'Study navigation', study: 'Study', session: 'Study session', review: 'Review your notes for',
  settings: 'Settings controls', language: 'Interface language', english: 'English', japanese: '日本語', notes: 'Study notes', share: 'Share anonymous usage',
  shareHint: 'Helps the team fix problems faster.', sections: 'Settings sections', general: 'General', privacy: 'Privacy', badge: 'Beta',
  settingsIcon: 'Open settings', delete: 'Delete course', confirmTitle: 'Delete Cognitive science?', confirmBody: 'This course and its notes will be permanently deleted.',
  cancel: 'Cancel', confirm: 'Delete course',
};

export function AstryxGallery() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [course, setCourse] = useState('Cognitive science');
  const [reminders, setReminders] = useState(true);
  const [period, setPeriod] = useState('today');
  const [destination, setDestination] = useState('library');
  const [menuAction, setMenuAction] = useState('No action selected');
  const [language, setLanguage] = useState('en');
  const [notes, setNotes] = useState('');
  const [share, setShare] = useState(false);
  const [section, setSection] = useState('general');
  const [confirming, setConfirming] = useState(false);
  return <section aria-label={copy.section} className="grid gap-[var(--space-4)] my-[var(--space-6)]">
    <h2>{copy.title}</h2>
    <div className="grid gap-[var(--space-6)] md:grid-cols-[260px_1fr]">
      <SideNav aria-label={copy.navigation}>
        <SideNavSection title={copy.study}>
          <SideNavItem label="Library" icon={<BookOpen />} isSelected={destination === 'library'} onClick={() => setDestination('library')} />
          <SideNavItem label="Planner" icon={<CalendarDays />} isSelected={destination === 'planner'} onClick={() => setDestination('planner')} />
        </SideNavSection>
      </SideNav>
      <div className="grid content-start gap-[var(--space-4)]">
        <div className="flex flex-wrap items-center gap-[var(--space-3)]">
          <Button label="Astryx dialog" variant="primary" onClick={() => setDialogOpen(true)} />
          <DropdownMenu button={{ label: 'Astryx actions' }} items={[
            { label: 'Review notes', onClick: () => setMenuAction('Review notes selected') },
            { label: 'Archive course', onClick: () => setMenuAction('Archive course selected') },
          ]} />
          <Tooltip content="Study a little every day" delay={0}>
            <Button label="Astryx tooltip" variant="ghost" />
          </Tooltip>
          <Button label="Disabled" isDisabled />
        </div>
        <TextInput label="Astryx course name" value={course} onChange={setCourse} />
        <Switch label="Astryx study reminders" value={reminders} onChange={setReminders} />
        <SegmentedControl label="Astryx study period" value={period} onChange={setPeriod}>
          <SegmentedControlItem value="today" label="Today" />
          <SegmentedControlItem value="week" label="This week" />
        </SegmentedControl>
        <Card padding={4} className="settings-stack" aria-label={copy.settings}>
          <TabList role="tablist" aria-label={copy.sections} value={section} onChange={setSection}>
            <Tab value="general" label={copy.general} panelId="gallery-general" />
            <Tab value="privacy" label={copy.privacy} panelId="gallery-privacy" />
          </TabList>
          <Selector label={copy.language} options={[{ value: 'en', label: copy.english }, { value: 'ja', label: copy.japanese }]} value={language} onChange={setLanguage} />
          <TextArea label={copy.notes} value={notes} onChange={setNotes} rows={3} />
          <CheckboxInput label={copy.share} description={copy.shareHint} value={share} onChange={setShare} />
          <div className="flex flex-wrap items-center gap-[var(--space-3)]">
            <Badge label={copy.badge} />
            <IconButton label={copy.settingsIcon} icon={<Settings />} variant="ghost" />
            <Button label={copy.delete} variant="destructive" onClick={() => setConfirming(true)} />
          </div>
        </Card>
        <output aria-live="polite">{menuAction} · {destination} · {period}</output>
      </div>
    </div>
    <AlertDialog isOpen={confirming} onOpenChange={setConfirming} title={copy.confirmTitle} description={copy.confirmBody}
      actionLabel={copy.confirm} cancelLabel={copy.cancel} onAction={() => setConfirming(false)} />
    <Dialog isOpen={dialogOpen} onOpenChange={setDialogOpen} width={480}>
      <DialogHeader title={copy.session} onOpenChange={setDialogOpen} />
      <div className="grid gap-[var(--space-4)] p-[var(--space-6)]">
        <p>{copy.review} {course}.</p>
        <Button label="Start studying" variant="primary" onClick={() => setDialogOpen(false)} />
      </div>
    </Dialog>
  </section>;
}
