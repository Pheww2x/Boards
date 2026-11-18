import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { addAuditLog, addEventLog, state } from '../services/store';
import { emitRealtimeEvent } from '../utils/network';

const router = Router();

router.get('/', requireAuth, requireRole('super_admin', 'owner', 'staff', 'tenant'), (req, res) => {
  return res.json({ reservations: state.reservations });
});

router.post('/', requireAuth, requireRole('super_admin', 'owner', 'staff', 'tenant'), (req, res) => {
  const payload = req.body ?? {};
  const reservation = {
    id: `reservation-${Date.now()}`,
    roomId: payload.roomId ?? 'room-101',
    tenantId: payload.tenantId ?? 'tenant-1',
    boardingHouseId: payload.boardingHouseId ?? state.boardingHouses[0]?.id ?? 'boarding-house-1',
    checkInDate: payload.checkInDate ?? new Date().toISOString(),
    checkOutDate: payload.checkOutDate ?? new Date(Date.now() + 86400000 * 30).toISOString(),
    deposit: Number(payload.deposit ?? 0),
    status: 'confirmed' as const,
    createdAt: new Date().toISOString(),
  };

  state.reservations.push(reservation);
  addEventLog('reservation:created', reservation.id, reservation.boardingHouseId);
  addAuditLog('create-reservation', req.user?.id ?? 'system', `Reservation created for room ${reservation.roomId}`);
  emitRealtimeEvent('reservation:created', reservation, { boardingHouseId: reservation.boardingHouseId });
  return res.status(201).json(reservation);
});

export default router;
