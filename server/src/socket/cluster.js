// Running more than one server process (NFR-14).
//
// Default: one process, Socket.IO's built-in in-memory adapter, nothing to configure.
// Cluster mode: set REDIS_URL on EVERY instance. Events (messages, typing, status, room updates)
// then travel between instances through Redis, and "who is online" is answered for the whole
// cluster instead of from one process's memory (see presence.js).
//
// Extra packages are only needed in cluster mode:  npm install redis @socket.io/redis-streams-adapter
// Behind a load balancer use sticky sessions, or make the client websocket-only.

export const isClusterMode = () => Boolean(process.env.REDIS_URL);

// Call once, before the server starts listening. Returns a function that closes the Redis client.
export async function attachClusterAdapter(io) {
  if (!isClusterMode()) return async () => {};

  let createClient;
  let createAdapter;
  try {
    ({ createClient } = await import('redis'));
    ({ createAdapter } = await import('@socket.io/redis-streams-adapter'));
  } catch {
    throw new Error('REDIS_URL is set but the packages are missing. Run: npm install redis @socket.io/redis-streams-adapter');
  }

  const client = createClient({ url: process.env.REDIS_URL });
  client.on('error', (err) => console.error('Redis error:', err.message));
  await client.connect();
  io.adapter(createAdapter(client));
  console.log('Cluster mode: Socket.IO events are shared through Redis');

  return async () => {
    await client.quit().catch(() => {});
  };
}
