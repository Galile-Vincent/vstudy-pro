/** Hold approved stable module targets until the trusted renderer can open the isolated pane. @packageDocumentation */
import type { MoodleRepository } from '../moodle/repository';
import type { AgentNavigation } from '../../shared/mcp-navigation';
import { McpFailure } from './errors';
import { normalizeWebviewUrl, publicWebviewUrl, webviewNavigation, webviewPolicy } from '../moodle/webview-policy';

export function createAgentNavigation(repository:Pick<MoodleRepository,'account'|'course'>,restoreWindow:()=>void,now=Date.now) {
  const queue:{target:AgentNavigation;expires:number}[]=[];
  const resolve = (accountId:string,courseId:string,moduleId:string):AgentNavigation => {
    const detail=repository.course(courseId);
    const module=detail.sections.filter(section=>section.accessible).flatMap(section=>section.modules).find(item=>item.id===moduleId);
    if (detail.course.accountId!==accountId || !module?.accessible || !module.url) throw new McpFailure('NOT_FOUND');
    const account=repository.account(accountId);
    const policy=webviewPolicy(account.siteUrl),url=normalizeWebviewUrl(module.url,policy);
    if (account.status!=='connected' || !url || webviewNavigation(url.href,policy)!=='internal' || [...url.searchParams.keys()].some(key=>/token|cookie|sesskey|key|auth|session/i.test(key))) throw new McpFailure('DENIED');
    return {accountId,courseId,moduleId,url:publicWebviewUrl(url.href)};
  };
  return {
    openModule(accountId:string,courseId:string,moduleId:string) {
      if (queue.length>=4) throw new McpFailure('RATE_LIMITED');
      queue.push({target:resolve(accountId,courseId,moduleId),expires:now()+60_000});
      restoreWindow();
    },
    take():AgentNavigation|null {
      while (queue.length) {
        const item=queue.shift()!;
        if (item.expires<=now()) continue;
        try {return resolve(item.target.accountId,item.target.courseId,item.target.moduleId);} catch { /* Disconnected and removed targets no longer navigate. */ }
      }
      return null;
    },
    clear() {queue.length=0;},
  };
}
