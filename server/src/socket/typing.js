import { isObjectId } from '../utils/validators.js';

// Client emits:    typing { to | room, isTyping: true | false }
// Others receive:  typing { from, room?, isTyping }
// Typing is never stored, it is only passed on to the people who should see it.
export function registerTyping(io, socket) {
  socket.on('typing', (payload) => {
    if (!payload || typeof payload !== 'object' || typeof payload.isTyping !== 'boolean') return;

    const event = { from: socket.userId, isTyping: payload.isTyping };

    if (payload.room !== undefined) {
      // Group chat: only someone who is inside the room may signal to it
      if (!isObjectId(payload.room)) return;
      const roomName = `room:${payload.room}`;
      if (!socket.rooms.has(roomName)) return;
      socket.to(roomName).emit('typing', { ...event, room: payload.room });
    } else if (isObjectId(payload.to)) {
      socket.to(`user:${payload.to}`).emit('typing', event);
    }
  });
}
