import type {IncomingMessage} from 'node:http';
import type {GenericProvider} from 'electron-updater/out/providers/GenericProvider';
type Executor = ConstructorParameters<typeof GenericProvider>[2]['executor'];
export function cappedExecutor(executor: Executor): Executor {
  return new Proxy(executor, {
    get(target, key, receiver) {
      if (key !== 'createRequest') return Reflect.get(target, key, receiver);
      return (options: Parameters<Executor['createRequest']>[0], callback: (response: IncomingMessage) => void) => {
        const request = target.createRequest(options, (response: IncomingMessage) => {
          let bytes = 0;
          response.on('data', (chunk: Buffer | string) => {
            bytes += Buffer.byteLength(chunk);
            if (bytes <= 65536) return;
            response.removeAllListeners('data');
            response.emit('error', new Error('Update metadata exceeds 64 KiB'));
            request.abort();
          });
          callback(response);
        });
        return request;
      };
    },
  });
}
