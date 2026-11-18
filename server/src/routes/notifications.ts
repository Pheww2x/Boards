import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { createNotification, getUserById, state, addEventLog } from '../services/store';
import { emitRealtimeEvent } from '../utils/network';

const router = Router();

router.get('/', requireAuth, (req, res) => {
  const notifications = state.notifications.filter((notification) => {
    if (req.user?.role === 'super_admin') return true;
    return notification.userId === req.user?.id || notification.userId === 'all';
  });
  return res.json({ notifications });
});

router.post('/', requireAuth, requireRole('super_admin', 'owner', 'staff'), (req, res) => {
  const payload = req.body ?? {};
  const targetUserId = typeof payload.userId === 'string' ? payload.userId : req.user?.id;
  const targetUser = targetUserId ? getUserById(targetUserId) : undefined;
  if (!targetUser) return res.status(404).json({ message: 'Notification recipient not found' });
  if (req.user?.role !== 'super_admin' && targetUser.boardingHouseId !== req.user?.boardingHouseId) {
    return res.status(403).json({ message: 'Recipient is outside your boarding house' });
  }
  const item = createNotification(targetUser.id, payload.title ?? 'New notification', payload.message ?? 'Notification');
  addEventLog('notification:new', item.id, payload.boardingHouseId ?? 'boarding-house-1');
  emitRealtimeEvent('notification:new', item, { userId: targetUser.id });
  return res.status(201).json(item);
});

export default router;
