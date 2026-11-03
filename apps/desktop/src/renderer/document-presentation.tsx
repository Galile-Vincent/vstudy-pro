import type { z } from 'zod';
import type { presentationSchema } from '../shared/presentation';
import { DataTable } from './components/assistant-ui/elements/data-table';
export default function DocumentPresentation({presentation}:{presentation:z.infer<typeof presentationSchema>}) {
 return <section className="document-presentation" aria-label={presentation.title}><h4>{presentation.title}</h4><DataTable columns={presentation.columns.map((label,index)=>({key:String(index),label,format:{kind:'text'},sortable:true}))} rows={presentation.rows.map(row=>Object.fromEntries(row.map((cell,index)=>[String(index),cell])))} /></section>;
}
