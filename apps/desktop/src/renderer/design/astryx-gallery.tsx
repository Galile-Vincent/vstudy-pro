import { useState } from 'react';
import {
  Button, Dialog, DialogHeader, DropdownMenu, Tooltip, TextInput, Switch,
  SegmentedControl, SegmentedControlItem, SideNav, SideNavSection, SideNavItem,
} from '@astryxdesign/core';
import { BookOpen, CalendarDays } from 'lucide-react';

const copy = { section: 'Astryx components', title: 'Astryx 0.7.11 · Neutral', navigation: 'Study navigation', study: 'Study', session: 'Study session', review: 'Review your notes for' };

export function AstryxGallery() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [course, setCourse] = useState('Cognitive science');
  const [reminders, setReminders] = useState(true);
  const [period, setPeriod] = useState('today');
  const [destination, setDestination] = useState('library');
  const [menuAction, setMenuAction] = useState('No action selected');
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
        <output aria-live="polite">{menuAction} · {destination} · {period}</output>
      </div>
    </div>
    <Dialog isOpen={dialogOpen} onOpenChange={setDialogOpen} width={480}>
      <DialogHeader title={copy.session} onOpenChange={setDialogOpen} />
      <div className="grid gap-[var(--space-4)] p-[var(--space-6)]">
        <p>{copy.review} {course}.</p>
        <Button label="Start studying" variant="primary" onClick={() => setDialogOpen(false)} />
      </div>
    </Dialog>
  </section>;
}
