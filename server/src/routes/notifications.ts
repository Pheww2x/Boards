import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { addEventLog, createNotification, getUserById } from '../services/store';
import Notification from '../models/Notification';
import { emitRealtimeEvent } from '../utils/network';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const filter = req.user?.role === 'super_admin'
    ? {}
    : { userId: { $in: [req.user?.id, 'all'] } };
  const notifications = await Notification.find(filter).exec();
  return res.json({ notifications });
}));

router.post('/', requireAuth, requireRole('super_admin', 'owner', 'staff'), asyncHandler(async (req, res) => {
  const payload = req.body ?? {};
  const targetUserId = typeof payload.userId === 'string' ? payload.userId : req.user?.id;
  const targetUser = targetUserId ? await getUserById(targetUserId) : undefined;
  if (!targetUser) return res.status(404).json({ message: 'Notification recipient not found' });
  if (req.user?.role !== 'super_admin' && targetUser.boardingHouseId !== req.user?.boardingHouseId) {
    return res.status(403).json({ message: 'Recipient is outside your boarding house' });
  }
  const item = await createNotification(targetUser.id, payload.title ?? 'New notification', payload.message ?? 'Notification');
  await addEventLog('notification:new', item.id, payload.boardingHouseId ?? 'boarding-house-1');
  emitRealtimeEvent('notification:new', item, { userId: targetUser.id });
  return res.status(201).json(item);
}));

export default router;
