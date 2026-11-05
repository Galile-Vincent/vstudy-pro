/**
 * Keep a bounded, session-only inventory of app-initiated network activity.
 * Owned by main/services.
 * Privileged IO stays in main; callers receive validated domain data rather than raw paths or secrets.
 * @packageDocumentation
 */
export type NetworkActivity = { at: string; what: string; to: string };
const events: NetworkActivity[] = [];
/** Record a bounded app-initiated network event without secrets or document content. */
export function recordEgress(what: string, to: string) {
  events.push({at:new Date().toISOString(),what,to});
  if (events.length > 500) events.shift();
}
/** Return the session inventory without claiming to capture internal CLI or Chromium traffic. */
export function networkActivity(): NetworkActivity[] { return events.map(event=>({...event})); }
