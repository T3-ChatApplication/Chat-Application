import { io } from 'socket.io-client';
import { API_URL, tokenStore } from './api.js';

let socket = null;

// Opens (or reuses) the authenticated socket connection
export function connectSocket() {
  if (socket) return socket;
  socket = io(API_URL, { auth: { token: tokenStore.get() } });
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
