import { Router } from 'express';
import { getHistory, getRoomHistory } from '../controllers/messageController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/room/:roomId', requireAuth, getRoomHistory);
router.get('/:userId', requireAuth, getHistory);

export default router;
