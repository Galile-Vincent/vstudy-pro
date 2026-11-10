type DeletionSession = Pick<Electron.Session,
  'clearStorageData' | 'clearCache' | 'clearAuthCache' | 'closeAllConnections'
  | 'flushStorageData'> & {cookies:Pick<Electron.Cookies,'flushStore'>};
export async function clearDeletionSession(current: DeletionSession): Promise<void> {
  const failures: unknown[] = [];
  const calls = [() => current.clearStorageData(), () => current.clearCache(),
    () => current.clearAuthCache(), () => current.closeAllConnections(),
    () => current.flushStorageData(), () => current.cookies.flushStore()];
  for (const call of calls) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([Promise.resolve().then(call),new Promise<never>((_resolve,reject) => {
        timer=setTimeout(() => reject(Error('Session deletion timed out')),2000);
      })]);
    } catch (error) {failures.push(error);}
    finally {clearTimeout(timer);}
  }
  if (failures.length) throw new AggregateError(failures,'Session deletion incomplete');
}
