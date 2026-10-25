// Pure validation helpers. Each returns an array of error strings (empty = valid).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[A-Za-z0-9_]+$/;

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

export function validateMessage({ to, text } = {}) {
  const errors = [];
  if (typeof to !== 'string' || !/^[a-f0-9]{24}$/i.test(to)) {
    errors.push('Receiver id is invalid');
  }
  if (typeof text !== 'string' || text.trim().length === 0) {
    errors.push('Message cannot be empty');
  } else if (text.trim().length > 2000) {
    errors.push('Message cannot exceed 2000 characters');
  }
  return errors;
}
