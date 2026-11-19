import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { addAuditLog, addEventLog } from '../services/store';
import BoardingHouse from '../models/BoardingHouse';
import Reservation from '../models/Reservation';
import { emitRealtimeEvent } from '../utils/network';
import { asyncHandler } from '../utils/asyncHandler';
import { createId } from '../utils/id';

const router = Router();

router.get('/', requireAuth, requireRole('super_admin', 'owner', 'staff', 'tenant'), asyncHandler(async (_req, res) => {
  return res.json({ reservations: await Reservation.find().exec() });
}));

router.post('/', requireAuth, requireRole('super_admin', 'owner', 'staff', 'tenant'), asyncHandler(async (req, res) => {
  const payload = req.body ?? {};
  const defaultBoardingHouse = await BoardingHouse.findOne().exec();
  const reservation = await Reservation.create({
    id: createId('reservation'),
    roomId: payload.roomId ?? 'room-101',
    tenantId: payload.tenantId ?? 'tenant-1',
    boardingHouseId: payload.boardingHouseId ?? defaultBoardingHouse?.id ?? 'boarding-house-1',
    checkInDate: payload.checkInDate ?? new Date().toISOString(),
    checkOutDate: payload.checkOutDate ?? new Date(Date.now() + 86400000 * 30).toISOString(),
    deposit: Number(payload.deposit ?? 0),
    status: 'confirmed',
    createdAt: new Date().toISOString(),
  });

  await addEventLog('reservation:created', reservation.id, reservation.boardingHouseId);
  await addAuditLog('create-reservation', req.user?.id ?? 'system', `Reservation created for room ${reservation.roomId}`);
  emitRealtimeEvent('reservation:created', reservation, { boardingHouseId: reservation.boardingHouseId });
  return res.status(201).json(reservation);
}));

export default router;
