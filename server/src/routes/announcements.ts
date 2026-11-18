import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { state } from '../services/store';

const router = Router();

router.get('/', requireAuth, (req, res) => {
  const items = state.announcements.slice(-10);
  return res.json({ announcements: items });
});

router.post('/', requireAuth, (req, res) => {
  const payload = req.body ?? {};
  const announcement = {
    id: `announcement-${Date.now()}`,
    message: payload.message ?? 'New announcement',
    createdAt: new Date().toISOString(),
  };
  state.announcements.push(announcement);
  return res.status(201).json(announcement);
});

export default router;
