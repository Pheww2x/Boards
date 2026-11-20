import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import Announcement from '../models/Announcement';
import BoardingHouse from '../models/BoardingHouse';
import { asyncHandler } from '../utils/asyncHandler';
import { createId } from '../utils/id';
import { getOwnerBoardingHouseIds, getVisibleAnnouncements } from '../services/announcements';
import { emitGlobalRealtimeEvent, emitRealtimeEvent } from '../utils/network';

const router = Router();

function emitAnnouncementChange(eventName: string, announcement: { id: string; boardingHouseId?: string }) {
  if (announcement.boardingHouseId) {
    emitRealtimeEvent(eventName, announcement, { boardingHouseId: announcement.boardingHouseId });
  } else {
    emitGlobalRealtimeEvent(eventName, announcement);
  }
}

async function findAnnouncementForUser(id: string, user: NonNullable<Express.Request['user']>) {
  if (user.role === 'super_admin') return Announcement.findOne({ id }).exec();
  const boardingHouseIds = await getOwnerBoardingHouseIds(user);
  return Announcement.findOne({ id, boardingHouseId: { $in: boardingHouseIds } }).exec();
}

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
    const ownerBoardingHouseIds = await getOwnerBoardingHouseIds(req.user);
    if (req.user.boardingHouseId && ownerBoardingHouseIds.includes(req.user.boardingHouseId)) {
      boardingHouseId = req.user.boardingHouseId;
    } else if (ownerBoardingHouseIds.length === 1) {
      boardingHouseId = ownerBoardingHouseIds[0];
    } else if (ownerBoardingHouseIds.length > 1) {
      return res.status(400).json({ message: 'Your account must be assigned to one boarding house before posting an announcement' });
    } else {
      return res.status(400).json({ message: 'No boarding house is assigned to this Owner account' });
    }
  }

  const announcement = await Announcement.create({
    id: createId('announcement'),
    ...(boardingHouseId ? { boardingHouseId } : {}),
    message,
    createdAt: new Date().toISOString(),
  });
  emitAnnouncementChange('announcement:created', announcement);
  return res.status(201).json(announcement);
}));

router.patch('/:id', requireAuth, requireRole('super_admin', 'owner'), asyncHandler(async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message) return res.status(400).json({ message: 'Announcement message is required' });

  const announcement = await findAnnouncementForUser(id, req.user!);
  if (!announcement) return res.status(404).json({ message: 'Announcement not found' });

  announcement.message = message;
  await announcement.save();
  emitAnnouncementChange('announcement:updated', announcement);
  return res.json(announcement);
}));

router.delete('/:id', requireAuth, requireRole('super_admin', 'owner'), asyncHandler(async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const announcement = await findAnnouncementForUser(id, req.user!);
  if (!announcement) return res.status(404).json({ message: 'Announcement not found' });

  await announcement.deleteOne();
  emitAnnouncementChange('announcement:deleted', announcement);
  return res.status(204).end();
}));

export default router;
