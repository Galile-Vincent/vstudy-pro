export type NetworkActivity = { at: string; what: string; to: string };
const events: NetworkActivity[] = [];
export function recordEgress(what: string, to: string) {
  events.push({at:new Date().toISOString(),what,to});
  if (events.length > 500) events.shift();
}
export function networkActivity(): NetworkActivity[] { return events.map(event=>({...event})); }
