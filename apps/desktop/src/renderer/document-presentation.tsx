import './csp-runtime';
import { renderGenerativeUI, type GenerativeUILibrary } from '@assistant-ui/generative-ui/react';
import type { z } from 'zod';
import type { presentationSchema } from '../shared/presentation';
import { styledGenerativeUILibrary } from './components/assistant-ui/elements/generative-ui';
import { DataTable } from './components/assistant-ui/elements/data-table';

const library: GenerativeUILibrary = {
 Table:{...styledGenerativeUILibrary.Table!,render:({columns,rows}) => {
  const headers=columns as {label:string}[];
  const values=rows as string[][];
  return <DataTable className="[&_dl]:grid-cols-1 [&_dd]:min-w-0 [&_dd]:shrink [&_dd]:break-words" columns={headers.map((column,index)=>({key:String(index),label:column.label,format:{kind:'text'},sortable:true}))} rows={values.map(row=>Object.fromEntries(row.map((cell,index)=>[String(index),cell])))} />;
 }},
};
export default function DocumentPresentation({presentation}:{presentation:z.infer<typeof presentationSchema>}) {
 return <section className="document-presentation" aria-label={presentation.title}><h4>{presentation.title}</h4>{renderGenerativeUI({$type:'Table',columns:presentation.columns.map(label=>({label})),rows:presentation.rows},library)}</section>;
}
