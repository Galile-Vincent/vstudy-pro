/** Only UUID-shaped VStudy references may survive remote-link redaction. @packageDocumentation */
import { z } from 'zod';
const id=z.string().uuid();
export function isMcpResourceUri(value:string):boolean {
  try {
    const url=new URL(value);
    if (url.protocol!=='vstudy:' || url.host!=='accounts' || url.username || url.password || url.search || url.hash) return false;
    const parts=url.pathname.split('/').slice(1);
    if (!id.safeParse(parts[0]).success || !id.safeParse(parts[2]).success) return false;
    return (parts.length===3 && ['courses','files'].includes(parts[1]!))
      || (parts.length===5 && parts[1]==='courses' && parts[3]==='modules' && id.safeParse(parts[4]).success);
  } catch {return false;}
}
