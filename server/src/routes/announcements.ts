import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import Announcement from '../models/Announcement';
import BoardingHouse from '../models/BoardingHouse';
import { asyncHandler } from '../utils/asyncHandler';
import { createId } from '../utils/id';
import { getVisibleAnnouncements } from '../services/announcements';
import { emitGlobalRealtimeEvent, emitRealtimeEvent } from '../utils/network';

const router = Router();

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const announcements = await getVisibleAnnouncements(req.user!);
  return res.json({ announcements });
}));

router.post('/', requireAuth, requireRole('super_admin', 'owner'), asyncHandler(async (req, res) => {
  const payload = req.body ?? {};
  const message = typeof payload.message === 'string' ? payload.message.trim() : '';
  if (!message) return res.status(400).json({ message: 'Announcement message is required' });

  let boardingHouseId: string | undefined;
  if (req.user?.role === 'owner') {
    const assignedHouse = req.user.boardingHouseId
      ? await BoardingHouse.findOne({ id: req.user.boardingHouseId }).select({ id: 1 }).lean().exec()
      : null;
    if (assignedHouse) {
      boardingHouseId = assignedHouse.id;
    } else {
      const ownedHouses = await BoardingHouse.find({ owner: req.user!.id }).select({ id: 1 }).limit(2).lean().exec();
      if (ownedHouses.length > 1) {
        return res.status(400).json({ message: 'Your account must be assigned to one boarding house before posting an announcement' });
      }
      if (!ownedHouses.length) {
        return res.status(400).json({ message: 'No boarding house is assigned to this Owner account' });
      }
      boardingHouseId = ownedHouses[0].id;
    }
  }

  const announcement = await Announcement.create({
    id: createId('announcement'),
    ...(boardingHouseId ? { boardingHouseId } : {}),
    message,
    createdAt: new Date().toISOString(),
  });
  if (boardingHouseId) {
    emitRealtimeEvent('announcement:created', announcement, { boardingHouseId });
  } else {
    emitGlobalRealtimeEvent('announcement:created', announcement);
  }
  return res.status(201).json(announcement);
}));

export default router;
