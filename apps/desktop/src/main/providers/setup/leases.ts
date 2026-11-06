/**
 * Track absolute executable paths held by live transports. Setup never deletes retained versions.
 * @packageDocumentation
 */
const leases = new Map<string, number>();
export function leaseExecutable(path: string) {
  leases.set(path, (leases.get(path) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const remaining = (leases.get(path) ?? 1) - 1;
    if (remaining) leases.set(path, remaining); else leases.delete(path);
  };
}
export function executableLeased(path: string) { return leases.has(path); }
export function hasExecutableLeases() { return leases.size > 0; }
