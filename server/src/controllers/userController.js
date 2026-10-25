import User from '../models/User.js';

// Everyone except the logged-in user, used for the conversation list
export async function listUsers(req, res, next) {
  try {
    const users = await User.find({ _id: { $ne: req.userId } }).sort({ username: 1 });
    return res.json({ users: users.map((u) => u.toPublic()) });
  } catch (err) {
    return next(err);
  }
}
