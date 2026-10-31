// Pure validation helpers. Each returns an array of error strings (empty = valid).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[A-Za-z0-9_]+$/;
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;
const ROOM_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _-]*$/;

// True for a 24-character hex string (a MongoDB ObjectId)
export function isObjectId(value) {
  return typeof value === 'string' && OBJECT_ID_RE.test(value);
}

export function validateRegister({ username, email, password } = {}) {
  const errors = [];
  if (typeof username !== 'string' || username.trim().length < 3 || username.trim().length > 30) {
    errors.push('Username must be 3-30 characters');
  } else if (!USERNAME_RE.test(username.trim())) {
    errors.push('Username may only contain letters, numbers and underscores');
  }
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    errors.push('A valid email is required');
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
    errors.push('Password must be 8-72 characters');
  }
  return errors;
}

export function validateLogin({ email, password } = {}) {
  const errors = [];
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    errors.push('A valid email is required');
  }
  if (typeof password !== 'string' || password.length === 0) {
    errors.push('Password is required');
  }
  return errors;
}

export function validateRoom(payload) {
  const { name } = payload && typeof payload === 'object' ? payload : {};
  const trimmed = typeof name === 'string' ? name.trim() : '';
  const errors = [];
  if (trimmed.length < 2 || trimmed.length > 40) {
    errors.push('Room name must be 2-40 characters');
  } else if (!ROOM_NAME_RE.test(trimmed)) {
    errors.push('Room name may only contain letters, numbers, spaces, hyphens and underscores');
  }
  return errors;
}

// A message goes either to one user (`to`) or to a room (`room`), never both
export function validateMessage(payload) {
  const { to, room, text } = payload && typeof payload === 'object' ? payload : {};
  const errors = [];
  const hasTo = to !== undefined && to !== null;
  const hasRoom = room !== undefined && room !== null;
  if (hasTo === hasRoom) {
    errors.push('Send the message to either a user or a room');
  } else if (hasTo && !isObjectId(to)) {
    errors.push('Receiver id is invalid');
  } else if (hasRoom && !isObjectId(room)) {
    errors.push('Room id is invalid');
  }
  if (typeof text !== 'string' || text.trim().length === 0) {
    errors.push('Message cannot be empty');
  } else if (text.trim().length > 2000) {
    errors.push('Message cannot exceed 2000 characters');
  }
  return errors;
}
