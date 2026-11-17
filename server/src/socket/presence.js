import { createPresenceTracker } from '../utils/presence.js';
import { isClusterMode } from './cluster.js';

// One tracker for this server process. It is the whole truth when there is one process.
export const presence = createPresenceTracker();

// In cluster mode a user's tabs may sit on different instances, so this process's tracker only
// knows part of the picture. The adapter can ask every instance, so we use that instead.
// When the last tab closes we wait a moment and look again: the other instance may still be
// removing its own socket, and a page reload should not flash "offline".
const CLUSTER_OFFLINE_GRACE_MS = Number(process.env.PRESENCE_GRACE_MS ?? 1000);

export async function isUserOnline(io, userId) {
  if (!isClusterMode()) return presence.isOnline(userId);
  const sockets = await io.in(`user:${userId}`).fetchSockets();
  return sockets.length > 0;
}

export async function onlineUserIds(io) {
  if (!isClusterMode()) return presence.onlineIds();
  const sockets = await io.fetchSockets();
  return [...new Set(sockets.map((s) => String(s.data?.userId)).filter((id) => id !== 'undefined'))];
}

export async function onlineCount(io) {
  return (await onlineUserIds(io)).length;
}

// Events sent to clients:
//   presence:list   { online: [userId, ...] }          full list, on connect or on request
//   presence:update { userId, online: true | false }   a user came online or went offline
export function registerPresence(io, socket) {
  const sendList = async () => {
    try {
      socket.emit('presence:list', { online: await onlineUserIds(io) });
    } catch (err) {
      console.error('presence list failed', err);
    }
  };

  if (!isClusterMode()) {
    // Single process: exact, synchronous, unchanged behaviour
    const cameOnline = presence.add(socket.userId, socket.id);
    socket.emit('presence:list', { online: presence.onlineIds() });
    if (cameOnline) socket.broadcast.emit('presence:update', { userId: socket.userId, online: true });
    socket.on('presence:request', sendList);
    socket.on('disconnect', () => {
      if (presence.remove(socket.userId, socket.id)) {
        io.emit('presence:update', { userId: socket.userId, online: false });
      }
    });
    return;
  }

  // Cluster: announcing "online" more than once is harmless (clients just set the flag), and it
  // avoids missing the announcement when two tabs connect on two instances at the same moment.
  sendList();
  socket.broadcast.emit('presence:update', { userId: socket.userId, online: true });
  socket.on('presence:request', sendList);
  socket.on('disconnect', () => {
    setTimeout(async () => {
      try {
        if (!(await isUserOnline(io, socket.userId))) {
          io.emit('presence:update', { userId: socket.userId, online: false });
        }
      } catch (err) {
        console.error('presence check failed', err);
      }
    }, CLUSTER_OFFLINE_GRACE_MS).unref();
  });
}
