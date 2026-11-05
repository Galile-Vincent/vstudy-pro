/**
 * Create locale-aware number, date, and cost formatters for presentation.
 * Owned by shared.
 * This module is importable by both processes and must not depend on Electron or privileged IO.
 * @packageDocumentation
 */
import { i18n } from './i18n';
/** Create locale-aware formatters without persisting display strings in the database. */
export function formatters(requestedLocale = i18n.language) {
 const locale=requestedLocale === 'en-XA' ? 'en' : requestedLocale;
 return {
  number:(value:number,options?:Intl.NumberFormatOptions)=>new Intl.NumberFormat(locale,options).format(value),
  currency:(value:number,options?:Intl.NumberFormatOptions)=>new Intl.NumberFormat(locale,{style:'currency',currency:'USD',maximumFractionDigits:3,...options}).format(value),
  date:(value:string|Date,options?:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat(locale,options).format(new Date(value)),
  relative:(value:number,unit:Intl.RelativeTimeFormatUnit,options?:Intl.RelativeTimeFormatOptions)=>new Intl.RelativeTimeFormat(locale,{numeric:'auto',...options}).format(value,unit),
 };
}
