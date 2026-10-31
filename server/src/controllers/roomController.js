import mongoose from 'mongoose';
import Room from '../models/Room.js';
import User from '../models/User.js';

export async function createRoom(req, res, next) {
  try {
    const name =
      typeof req.body?.name === 'string' ? req.body.name.trim() : '';

    if (!name || name.length > 40) {
      return res.status(400).json({
        message: 'Room name must contain between 1 and 40 characters',
      });
    }

    const normalizedName = name.toLowerCase();
    const userExists = await User.exists({ _id: req.userId });

    if (!userExists) {
      return res.status(401).json({ message: 'User not found' });
    }

    const room = await Room.create({
      name,
      normalizedName,
      createdBy: req.userId,
      members: [req.userId],
    });

    return res.status(201).json({ room: room.toPublic() });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: 'A room with this name already exists',
      });
    }

    return next(error);
  }
}

export async function listRooms(req, res, next) {
  try {
    const rooms = await Room.find().sort({ createdAt: -1 });

    return res.json({
      rooms: rooms.map((room) => ({
        ...room.toPublic(),
        isMember: room.members.some(
          (member) => member.toString() === req.userId.toString()
        ),
      })),
    });
  } catch (error) {
    return next(error);
  }
}

export async function joinRoom(req, res, next) {
  try {
    const { roomId } = req.params;

    if (!mongoose.isValidObjectId(roomId)) {
      return res.status(400).json({ message: 'Invalid room ID' });
    }

    const room = await Room.findByIdAndUpdate(
      roomId,
      { $addToSet: { members: req.userId } },
      { new: true, runValidators: true }
    );

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    return res.json({
      message: 'Joined room successfully',
      room: room.toPublic(),
    });
  } catch (error) {
    return next(error);
  }
}

export async function leaveRoom(req, res, next) {
  try {
    const { roomId } = req.params;

    if (!mongoose.isValidObjectId(roomId)) {
      return res.status(400).json({ message: 'Invalid room ID' });
    }

    const room = await Room.findByIdAndUpdate(
      roomId,
      { $pull: { members: req.userId } },
      { new: true }
    );

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    return res.json({
      message: 'Left room successfully',
      room: room.toPublic(),
    });
  } catch (error) {
    return next(error);
  }
}
