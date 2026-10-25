import { Router } from 'express';
import { getConversationHistory } from '../controllers/messageController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Get messages exchanged with a particular user.
router.get('/:userId', requireAuth, getConversationHistory);

export default router;