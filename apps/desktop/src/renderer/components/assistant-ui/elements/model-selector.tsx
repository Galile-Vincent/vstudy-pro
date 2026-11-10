import { useMemo, useState } from 'react';
import { Button, Popover, CommandPalette, CommandPaletteInput, createStaticSource } from '@astryxdesign/core';
import { tr } from '../../../../shared/i18n';
import type { ModelOption } from '../utils/model-selection';

export type ModelSelectorProps = {
  models: ModelOption[];
  value: string;
  onValueChange: (value: string) => void;
  onOpenChange?: (open: boolean) => void;
};

export function ModelSelector({models, value, onValueChange, onOpenChange}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const selected = models.find(model => model.id === value);
  const source = useMemo(() => createStaticSource(models.filter(model=>!model.disabled).map(model => ({
    id:model.id, label:model.name,
    auxiliaryData:{group:model.keywords?.[0], model},
  })), {keywords:item=>[...(item.auxiliaryData.model.keywords ?? [])]}), [models]);
  const changeOpen = (next:boolean) => {setOpen(next);onOpenChange?.(next);};
  return <Popover isOpen={open} onOpenChange={changeOpen} placement="above" label={tr('common:model')} padding={0} width={320} content={<div data-slot="model-selector-content"><div data-slot="model-selector-list">
    <CommandPalette isInline isOpen={open} onOpenChange={changeOpen} label={tr('common:model')} width={320} value={value} searchSource={source}
      input={<CommandPaletteInput data-slot="model-selector-search" label={tr('common:search_models')} placeholder={tr('common:search_models_or_providers')}/>}
      footer={null} emptySearchText={tr('common:no_models_found')} emptyBootstrapText={tr('common:no_models_found')}
      onValueChange={next=>{if(models.find(model=>model.id===next)?.disabled)return;onValueChange(next);changeOpen(false);}}
      renderItem={item=><span data-slot="model-selector-item" className="flex min-w-0 items-center gap-2">{item.auxiliaryData.model.icon}<span className="flex min-w-0 flex-col"><span>{item.label}</span>{item.auxiliaryData.model.description && <small>{item.auxiliaryData.model.description}</small>}</span></span>}/>
    </div>{models.some(model=>model.disabled) && <ul className="grid gap-2 border-t p-4 text-sm text-muted-foreground">{models.filter(model=>model.disabled).map(model=><li key={model.id} aria-disabled="true">{model.name}{model.description && <p>{model.description}</p>}</li>)}</ul>}
  </div>}>{trigger=><Button {...trigger} data-slot="model-selector-trigger" label={tr('common:model')} variant="ghost" role="combobox" aria-haspopup="listbox" onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();changeOpen(true);}}}>
    <span data-slot="model-selector-value"><span className="truncate font-medium">{selected?.name ?? tr('common:choose_a_model')}</span></span>
  </Button>}</Popover>;
}
