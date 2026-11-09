import { updateStateSchema, type UpdateState } from '../../shared/updates';
export type UpdateEvent = { type: 'check' } | { type: 'available'; version: string }
  | { type: 'current' } | { type: 'download' } | { type: 'progress'; percent: number }
  | { type: 'ready'; version: string } | { type: 'error'; code: Extract<UpdateState, {status:'error'}>['code'] };
export function reduceUpdate(state: UpdateState, event: UpdateEvent): UpdateState {
  if (state.status === 'unsupported') return state;
  switch (event.type) {
    case 'check': return ['idle', 'error', 'available'].includes(state.status) ? { status: 'checking' } : state;
    case 'available': return state.status === 'checking' ? updateStateSchema.parse({ status: 'available',
      version: event.version, releaseUrl: `https://github.com/ava-apple/vstudy-pro/releases/tag/v${event.version}` }) : state;
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
  const code = String((error as {code?:unknown})?.code ?? '');
  if (/SHA512|CHECKSUM|SIGNATURE/.test(code)) return 'integrity';
  if (/ENOTFOUND|ECONN|ETIMEDOUT|ERR_UPDATER_(LATEST_VERSION_NOT_FOUND|CHANNEL_FILE_NOT_FOUND)/.test(code)) return 'network';
  return 'failed';
}
