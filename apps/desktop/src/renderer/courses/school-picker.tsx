/** Accessible local directory picker. Only explicit selection or URL submission probes a school. */
import { useRef, useState } from 'react';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MoodleAccount, MoodleSchool, MoodleSiteCheck } from '../../shared/moodle';
import { tr } from '../../shared/i18n';
import { Button } from '../components/ui/button';
import { Input, FormField } from '../components/ui';
import { countryNames, fuzzySiteMatch, schoolMonogram, schoolSearchText, sortedSchools } from './school-search';
import './schools.css';

type Choice = {url:string;name:string;search:string;group:'connected'|'recent'|'directory';icon?:string;country?:string};
/** Connected schools precede recent choices, then bundled directory entries, without duplicate URLs. */
export function SchoolPicker({schools,recent,accounts,input,onInput,busy,onFind,error}: {
  schools:MoodleSchool[];recent:MoodleSiteCheck[];accounts:MoodleAccount[];input:string;
  error?:string|undefined;onInput:(value:string)=>void;busy:boolean;onFind:(url:string)=>void;
}) {
  const {i18n} = useTranslation('schools');
  const [active,setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const language = i18n.resolvedLanguage ?? 'en';
  const choices: Choice[] = [];
  const seen = new Set<string>();
  const add = (choice: Choice) => {
    if (!seen.has(choice.url)) {choices.push(choice);seen.add(choice.url);}
  };
  const search = (url:string,name:string) => {
    const school = schools.find(item => item.host === url);
    return `${name} ${url} ${school ? schoolSearchText(school) : ''}`;
  };
  accounts.forEach(site => add({url:site.siteUrl,name:site.siteName,search:search(site.siteUrl,site.siteName),group:'connected'}));
  recent.forEach(site => add({url:site.siteUrl,name:site.siteName,search:`${search(site.siteUrl,site.siteName)} ${countryNames(site.country)}`,group:'recent',...(site.country ? {country:site.country} : {}),...(site.iconUrl ? {icon:site.iconUrl} : {})}));
  sortedSchools(schools,language,navigator.language).forEach(site => add({url:site.host,name:site.localizedNames?.[language] ?? site.name,search:schoolSearchText(site),group:'directory',...(site.country ? {country:site.country} : {})}));
  const results = choices.filter(choice => fuzzySiteMatch(input,choice.search));
  const selected = results[active];
  const urlLike = /^https:\/\/[^\s]+$/i.test(input.trim()) || /^(?:https:\/\/)?[^\s/?#]+\.[^\s]+$/i.test(input.trim());
  const fieldError = /^http:\/\//i.test(input) ? tr("schools:https_required")
    : /^(?!https?:)[a-z][a-z0-9+.-]*:\/\//i.test(input) || /[?&](?:qrlogin|qrloginkey|token|wstoken)=/i.test(input)
      ? tr("schools:qr_unsupported") : error;
  return <>
    <form className="moodle-connect-form" onSubmit={event => {event.preventDefault();if (!busy) {if (selected) onFind(selected.url); else if (urlLike) onFind(input);else if (results[0]) onFind(results[0].url);}}}>
      <FormField error={fieldError} controlId="moodle-site" label={tr('schools:search_label')} describedBy="moodle-url-hint moodle-search-count" children={field => <Input {...field} ref={inputRef} value={input} autoComplete="off" autoCapitalize="none" spellCheck={false}
        placeholder={tr('schools:search_placeholder')} disabled={busy}
        role="combobox" aria-autocomplete="list" aria-expanded={results.length > 0} aria-controls="moodle-school-results"
        aria-activedescendant={selected ? `moodle-school-${active}` : undefined}
        onChange={event => {onInput(event.target.value);setActive(-1);}}
        onKeyDown={event => {
          if (['ArrowDown','ArrowUp','Home','End'].includes(event.key) && results.length) {
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? results.length-1 : active < 0 ? (event.key === 'ArrowDown' ? 0 : results.length-1) : (active + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
            setActive(next);document.getElementById(`moodle-school-${next}`)?.scrollIntoView?.({block:'nearest'});
          } else if (event.key === 'Escape' && active !== -1) {event.preventDefault();event.stopPropagation();setActive(-1);}
        }} />} />
      <small id="moodle-url-hint">{tr('schools:privacy_hint')}</small>
      <Button type="submit" disabled={(!urlLike && !results.length) || busy}>{busy ? <LoaderCircle className="moodle-spin" /> : <ArrowRight />}{tr(busy ? 'moodle:checking_site' : 'moodle:check_site')}</Button>
    </form>
    <small id="moodle-search-count" role="status" aria-live="polite">{tr('schools:result_count',{count:results.length})}</small>
    <div id="moodle-school-results" className="moodle-school-results" role="listbox" aria-label={tr('schools:results')}>
      {(['connected','recent','directory'] as const).map(group => results.some(choice => choice.group === group) && <div key={group} role="group" aria-label={tr(`schools:${group}`)} className="moodle-site-list">
        <h3 aria-hidden="true">{tr(`schools:${group}`)}</h3>
        {results.map((choice,index) => choice.group === group && <Button key={choice.url} id={`moodle-school-${index}`} role="option" aria-selected={active === index} tabIndex={-1} variant="ghost" disabled={busy} onClick={() => onFind(choice.url)}>
          <SchoolLogo name={choice.name} icon={choice.icon} />
          <span>{choice.name}<small>{new URL(choice.url).host}{new URL(choice.url).pathname.replace(/\/$/,'')}{choice.country ? ` · ${new Intl.DisplayNames([language],{type:'region'}).of(choice.country)}` : ''}</small></span><ArrowRight aria-hidden="true" />
        </Button>)}
      </div>)}
    </div>
    {!results.length && <p>{tr('schools:no_results')}</p>}
    <Button variant="ghost" disabled={busy} onClick={() => {if (urlLike) onFind(input);else {onInput('');setActive(-1);inputRef.current?.focus();}}}>{tr('schools:add_url')}</Button>
    <small>{tr('schools:multiple_accounts')}</small>
  </>;
}

/** Render only main-owned raster data, with a generated monogram if the image cannot load. */
export function SchoolLogo({name,icon}: {name:string;icon?:string|undefined}) {
  const [failed,setFailed] = useState<string>();
  return icon && icon !== failed && /^data:image\/(png|jpeg|gif|webp);base64,/.test(icon)
    ? <img className="moodle-school-logo" src={icon} alt="" onError={() => setFailed(icon)} />
    : <span className="moodle-school-monogram" aria-hidden="true">{schoolMonogram(name)}</span>;
}
