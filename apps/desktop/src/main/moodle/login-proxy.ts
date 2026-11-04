import { createServer } from 'node:http';
import { connect } from 'node:net';
import type { Socket } from 'node:net';
import { networkUrl, resolvePublicHost, type Resolver } from './site-url';

export async function loginProxy(resolver?: Resolver) {
  let closed = false;
  const sockets = new Set<Socket>();
  const server = createServer((_request,response) => {response.writeHead(403); response.end();});
  server.on('connection',socket => {sockets.add(socket); socket.on('close',() => sockets.delete(socket));});
  server.on('connect',(request,client,head) => {
    void (async () => {
      const target = networkUrl(`https://${request.url}`);
      const addresses = await resolvePublicHost(target.hostname,resolver);
      if (closed || client.destroyed) return;
      const upstream = connect({host:addresses[0]!.address,port:443});
      sockets.add(upstream);
      upstream.on('close',() => sockets.delete(upstream));
      upstream.on('error',() => client.destroy());
      client.on('error',() => upstream.destroy());
      client.on('close',() => upstream.destroy());
      upstream.once('connect',() => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) upstream.write(head);
        client.pipe(upstream); upstream.pipe(client);
      });
    })().catch(() => client.destroy());
  });
  await new Promise<void>((resolve,reject) => {server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Moodle proxy unavailable');
  return {port:address.port,close:() => {closed = true;for (const socket of sockets) socket.destroy(); server.close();}};
}
