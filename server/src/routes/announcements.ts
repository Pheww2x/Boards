import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import Announcement from '../models/Announcement';
import { asyncHandler } from '../utils/asyncHandler';
import { createId } from '../utils/id';

const router = Router();

router.get('/', requireAuth, asyncHandler(async (_req, res) => {
  const announcements = await Announcement.find().sort({ createdAt: 1, _id: 1 }).exec();
  return res.json({ announcements: announcements.slice(-10) });
}));

router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const payload = req.body ?? {};
  const announcement = await Announcement.create({
    id: createId('announcement'),
    message: payload.message ?? 'New announcement',
    createdAt: new Date().toISOString(),
  });
  return res.status(201).json(announcement);
}));

export default router;
