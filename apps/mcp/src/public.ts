/** Main-process installer API. Call only from validated owner-authorized IPC. @packageDocumentation */
export { installClient, uninstallClient, restoreConfigBackup } from './installer';
export type { InstallResult } from './installer';
export { doctor, detectClients } from './doctor';
export type { DoctorOptions, DoctorResult } from './doctor';
export type { ClientOptions } from './client-config';
