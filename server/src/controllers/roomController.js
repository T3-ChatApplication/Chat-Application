import Room from '../models/Room.js';
import { isObjectId, validateRoom } from '../utils/validators.js';

// Keep live sockets in step with membership, so room events reach the right people at once
function syncSockets(req, userId, roomId, joining) {
  const io = req.app.get('io');
  if (!io) return;
  const sockets = io.in(`user:${userId}`);
  if (joining) sockets.socketsJoin(`room:${roomId}`);
  else sockets.socketsLeave(`room:${roomId}`);
}

// Tells every client to refresh its room list and member lists
function announce(req, roomId) {
  req.app.get('io')?.emit('room:updated', { roomId: String(roomId) });
}

// GET /api/rooms: every room, with isMember telling the caller which ones they belong to
export async function listRooms(req, res, next) {
  try {
    const rooms = await Room.find().sort({ name: 1 });
    return res.json({ rooms: rooms.map((r) => r.toPublic(req.userId)) });
  } catch (err) {
    return next(err);
  }
}

// POST /api/rooms { name }
export async function createRoom(req, res, next) {
  try {
    const errors = validateRoom(req.body);
    if (errors.length) return res.status(400).json({ message: errors[0], errors });

    const name = req.body.name.trim();
    const existing = await Room.findOne({ name }).collation({ locale: 'en', strength: 2 });
    if (existing) return res.status(409).json({ message: 'A room with that name already exists' });

    const room = await Room.create({ name, createdBy: req.userId, members: [req.userId] });
    syncSockets(req, req.userId, room._id, true);
    announce(req, room._id);
    return res.status(201).json({ room: room.toPublic(req.userId) });
  } catch (err) {
    // Two people creating the same name at the same moment
    if (err.code === 11000) return res.status(409).json({ message: 'A room with that name already exists' });
    return next(err);
  }
}

// GET /api/rooms/:id: details and member list (members only)
export async function getRoom(req, res, next) {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid room id' });

    const room = await Room.findById(req.params.id).populate('members', 'username');
    if (!room) return res.status(404).json({ message: 'Room not found' });

    const view = room.toPublic(req.userId, { withMembers: true });
    if (!view.isMember) return res.status(403).json({ message: 'Join the room to see its members' });
    return res.json({ room: view });
  } catch (err) {
    return next(err);
  }
}

// POST /api/rooms/:id/join
export async function joinRoom(req, res, next) {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid room id' });

    const room = await Room.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { members: req.userId } },
      { new: true }
    );
    if (!room) return res.status(404).json({ message: 'Room not found' });

    syncSockets(req, req.userId, room._id, true);
    announce(req, room._id);
    return res.json({ room: room.toPublic(req.userId) });
  } catch (err) {
    return next(err);
  }
}

// POST /api/rooms/:id/leave
export async function leaveRoom(req, res, next) {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid room id' });

    const room = await Room.findByIdAndUpdate(
      req.params.id,
      { $pull: { members: req.userId } },
      { new: true }
    );
    if (!room) return res.status(404).json({ message: 'Room not found' });

    syncSockets(req, req.userId, room._id, false);
    announce(req, room._id);
    return res.json({ room: room.toPublic(req.userId) });
  } catch (err) {
    return next(err);
  }
}
