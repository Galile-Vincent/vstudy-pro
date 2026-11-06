import type { createIpcRegistrar } from './register';
import type { IpcChannel } from '../../shared/ipc';
import type { AnalyticsService } from '../analytics/service';
import type { Onboarding } from '../../shared/analytics';

export type NewsletterConsentHook = (consent:Pick<Onboarding,'email_provided'|'updates_opted_in'>)=>void|Promise<void>;
export function registerAnalyticsIpc(registrar:ReturnType<typeof createIpcRegistrar>,implemented:Set<IpcChannel>,service:AnalyticsService,newsletter?:NewsletterConsentHook) {
  for (const channel of ['analytics:getState','analytics:setConsent','analytics:completeOnboarding','analytics:track','analytics:requestDeletion'] as const) implemented.add(channel);
  registrar.handle('analytics:getState',()=>service.getState());
  registrar.handle('analytics:setConsent',({enabled})=>service.setConsent(enabled));
  registrar.handle('analytics:completeOnboarding',input=>{
    const state=service.completeOnboarding(input);
    if (newsletter) void Promise.resolve().then(()=>newsletter({email_provided:input.email_provided,updates_opted_in:input.updates_opted_in})).catch(()=>undefined);
    return state;
  });
  registrar.handle('analytics:track',({event,properties,event_id})=>{service.rendererTrack(event,properties,event_id);return {ok:true};});
  registrar.handle('analytics:requestDeletion',()=>service.requestDeletion());
}
