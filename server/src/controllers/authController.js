import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { signToken } from '../utils/token.js';
import { validateRegister, validateLogin } from '../utils/validators.js';

export async function register(req, res, next) {
  try {
    const errors = validateRegister(req.body);
    if (errors.length) return res.status(400).json({ message: errors[0], errors });

    const username = req.body.username.trim();
    const email = req.body.email.trim().toLowerCase();

    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) {
      const field = existing.email === email ? 'Email' : 'Username';
      return res.status(409).json({ message: `${field} is already registered` });
    }

    const passwordHash = await bcrypt.hash(req.body.password, 10);
    const user = await User.create({ username, email, passwordHash });

    return res.status(201).json({ token: signToken(user._id), user: user.toPublic() });
  } catch (err) {
    return next(err);
  }
}

export async function login(req, res, next) {
  try {
    const errors = validateLogin(req.body);
    if (errors.length) return res.status(400).json({ message: errors[0], errors });

    const email = req.body.email.trim().toLowerCase();
    const user = await User.findOne({ email }).select('+passwordHash');

    // Same message for unknown email and wrong password so accounts can't be probed
    const ok = user && (await bcrypt.compare(req.body.password, user.passwordHash));
    if (!ok) return res.status(401).json({ message: 'Invalid email or password' });

    return res.json({ token: signToken(user._id), user: user.toPublic() });
  } catch (err) {
    return next(err);
  }
}

// Restores the session on page refresh using the stored JWT
export async function me(req, res, next) {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(401).json({ message: 'User no longer exists' });
    return res.json({ user: user.toPublic() });
  } catch (err) {
    return next(err);
  }
}
