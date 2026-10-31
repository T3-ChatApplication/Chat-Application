import { Router } from 'express';
import {
  createRoom,
  listRooms,
  joinRoom,
  leaveRoom,
} from '../controllers/roomController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.post('/', createRoom);
router.get('/', listRooms);
router.post('/:roomId/join', joinRoom);
router.post('/:roomId/leave', leaveRoom);

export default router;
