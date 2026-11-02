import { Router } from 'express';
import {
  getHistory,
  getRoomHistory,
  getOfflineMessages,
  ackOfflineMessages,
} from '../controllers/messageController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/offline', requireAuth, getOfflineMessages);
router.post('/offline/ack', requireAuth, ackOfflineMessages);
router.get('/room/:roomId', requireAuth, getRoomHistory);
router.get('/:userId', requireAuth, getHistory);

export default router;
