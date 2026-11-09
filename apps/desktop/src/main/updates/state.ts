import { updateStateSchema, type UpdateState } from '../../shared/updates';
export type UpdateEvent = { type: 'check' } | { type: 'available'; version: string; size?:number | undefined }
  | { type: 'current' } | { type: 'download' } | { type: 'progress'; percent: number }
  | { type: 'ready'; version: string } | { type: 'error'; code: Extract<UpdateState, {status:'error'}>['code'] };
export function reduceUpdate(state: UpdateState, event: UpdateEvent): UpdateState {
  if (state.status === 'unsupported') return state;
  switch (event.type) {
    case 'check': return ['idle', 'error', 'available'].includes(state.status) ? { status: 'checking' } : state;
    case 'available': return state.status === 'checking' ? updateStateSchema.parse({ status: 'available',
      version: event.version, ...(event.size ? {size:event.size} : {}), releaseUrl: `https://github.com/ava-apple/vstudy-pro/releases/tag/v${event.version}` }) : state;
    case 'current': return state.status === 'checking' ? { status: 'idle' } : state;
    case 'download': return state.status === 'available' ? { status: 'downloading', percent: 0 } : state;
    case 'progress': return state.status === 'downloading' && Number.isFinite(event.percent)
      ? { status: 'downloading', percent: Math.round(Math.max(0, Math.min(100, event.percent))) } : state;
    case 'ready': return state.status === 'downloading'
      ? updateStateSchema.parse({ status: 'ready', version: event.version }) : state;
    case 'error': return { status: 'error', code: event.code };
  }
}
export function updateError(error: unknown): Extract<UpdateState, {status:'error'}>['code'] {
  const value = error as {code?:unknown; message?:unknown; statusCode?:unknown} | null;
  const code = typeof value?.code === 'string' ? value.code : '';
  if (code === 'ERR_UPDATER_INVALID_UPDATE_INFO') return 'failed';
  if (/^ERR_(?:UPDATER_INVALID_SIGNATURE|CHECKSUM_MISMATCH|UPDATER_CHECKSUM_MISMATCH)$/.test(code)) return 'integrity';
  if (value?.statusCode === 404 || /^ERR_UPDATER_(LATEST_VERSION_NOT_FOUND|CHANNEL_FILE_NOT_FOUND)$/.test(code)) return 'network';
  const message = code || (typeof value?.message === 'string' ? value.message : '');
  if (/^(?:net::)?ERR_INTERNET_DISCONNECTED$/.test(message)) return 'offline';
  if (/^(?:net::)?(?:ENOTFOUND|ECONN\w*|ETIMEDOUT|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_\w+|ERR_TIMED_OUT)$/.test(message)) return 'network';
  if (error instanceof Error && /^New version .*not signed by the application owner/.test(error.message)) return 'integrity';
  if (/^ERR_CHECKSUM_MISMATCH$/.test(message)) return 'integrity';
  return 'failed';
}
