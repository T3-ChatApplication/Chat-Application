import { Router } from 'express';
import {
  listRooms,
  createRoom,
  getRoom,
  joinRoom,
  leaveRoom,
} from '../controllers/roomController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, listRooms);
router.post('/', requireAuth, createRoom);
router.get('/:id', requireAuth, getRoom);
router.post('/:id/join', requireAuth, joinRoom);
router.post('/:id/leave', requireAuth, leaveRoom);

export default router;
