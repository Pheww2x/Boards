import { Router } from 'express';
import { requireAuth, requireRole, type Room } from '../middleware/auth';
import { addAuditLog, addEventLog, assignTenantToRoom, state } from '../services/store';
import { emitRealtimeEvent } from '../utils/network';

const router = Router();

function canAccessBoardingHouse(user: NonNullable<Express.Request['user']>, boardingHouseId: string) {
  if (user.role === 'super_admin') return true;
  return user.boardingHouseId === boardingHouseId ||
    state.boardingHouses.some((house) => house.id === boardingHouseId && house.owner === user.id);
}

router.get('/', requireAuth, requireRole('super_admin', 'owner', 'staff', 'tenant'), (req, res) => {
  if (req.user?.role === 'tenant') {
    const tenant = state.tenants.find((item) => item.userId === req.user?.id);
    const room = tenant?.roomId ? state.rooms.find((item) => item.id === tenant.roomId) : undefined;
    return res.json({ rooms: room ? [room] : [], boardingHouses: tenant ? state.boardingHouses.filter((house) => house.id === tenant.boardingHouseId) : [] });
  }

  const rooms = state.rooms.filter((room) => canAccessBoardingHouse(req.user!, room.boardingHouseId));
  const boardingHouses = state.boardingHouses.filter((house) => canAccessBoardingHouse(req.user!, house.id));
  return res.json({ rooms, boardingHouses });
});

router.post('/', requireAuth, requireRole('super_admin', 'owner'), (req, res) => {
  const payload = req.body ?? {};
  const boardingHouseId = req.user?.role === 'super_admin'
    ? payload.boardingHouseId ?? state.boardingHouses[0]?.id
    : req.user?.boardingHouseId;
  const boardingHouse = state.boardingHouses.find((house) => house.id === boardingHouseId);
  const roomNumber = typeof payload.roomNumber === 'string' ? payload.roomNumber.trim() : '';
  const maxCapacity = Number(payload.maxCapacity);
  const monthlyRent = Number(payload.monthlyRent);
  const floor = Number(payload.floor);

  if (!boardingHouse) return res.status(400).json({ message: 'A valid boarding house is required' });
  if (!roomNumber || !Number.isInteger(maxCapacity) || maxCapacity < 1 || !Number.isInteger(floor) || floor < 1 || !Number.isFinite(monthlyRent) || monthlyRent < 0) {
    return res.status(400).json({ message: 'Room number, floor, capacity, and rent must be valid' });
  }
  if (state.rooms.some((room) => room.boardingHouseId === boardingHouse.id && room.roomNumber === roomNumber)) {
    return res.status(409).json({ message: 'That room number already exists in this boarding house' });
  }

  const room: Room = {
    id: `room-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    boardingHouseId: boardingHouse.id,
    roomNumber,
    floor,
    type: payload.type ?? 'single',
    maxCapacity,
    occupancy: 0,
    monthlyRent,
    facilities: Array.isArray(payload.facilities) ? payload.facilities : [],
    description: typeof payload.description === 'string' ? payload.description : '',
    status: 'available',
    createdAt: new Date().toISOString(),
  };

  state.rooms.push(room);
  boardingHouse.totalRooms = state.rooms.filter((item) => item.boardingHouseId === boardingHouse.id).length;
  addEventLog('room:created', room.id, room.boardingHouseId);
  addAuditLog('create-room', req.user?.id ?? 'system', `Created room ${room.roomNumber}`);
  emitRealtimeEvent('room:created', room, { boardingHouseId: room.boardingHouseId });
  emitRealtimeEvent('room:availabilityUpdated', room, { boardingHouseId: room.boardingHouseId });
  return res.status(201).json(room);
});

router.patch('/:id', requireAuth, requireRole('super_admin', 'owner', 'staff'), (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const room = state.rooms.find((item) => item.id === id);
  if (!room) return res.status(404).json({ message: 'Room not found' });
  if (!canAccessBoardingHouse(req.user!, room.boardingHouseId)) return res.status(403).json({ message: 'Forbidden' });

  const updates = req.body ?? {};
  if (updates.maxCapacity !== undefined) {
    const capacity = Number(updates.maxCapacity);
    if (!Number.isInteger(capacity) || capacity < room.occupancy || capacity < 1) {
      return res.status(400).json({ message: 'Capacity must be at least the current occupancy' });
    }
    room.maxCapacity = capacity;
  }
  if (updates.monthlyRent !== undefined) {
    const rent = Number(updates.monthlyRent);
    if (!Number.isFinite(rent) || rent < 0) return res.status(400).json({ message: 'Rent must be a non-negative number' });
    room.monthlyRent = rent;
  }
  if (updates.status === 'maintenance' || updates.status === 'available') room.status = updates.status;
  if (typeof updates.description === 'string') room.description = updates.description;
  if (Array.isArray(updates.facilities)) room.facilities = updates.facilities;

  addEventLog('room:availabilityUpdated', room.id, room.boardingHouseId);
  emitRealtimeEvent('room:availabilityUpdated', room, { boardingHouseId: room.boardingHouseId });
  return res.json(room);
});

router.post('/:id/assign', requireAuth, requireRole('super_admin', 'owner', 'staff'), (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const room = state.rooms.find((item) => item.id === id);
  const tenant = state.tenants.find((item) => item.id === req.body?.tenantId);
  if (!room || !tenant) return res.status(404).json({ message: 'Room or tenant not found' });
  if (!canAccessBoardingHouse(req.user!, room.boardingHouseId) || tenant.boardingHouseId !== room.boardingHouseId) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    const result = assignTenantToRoom(tenant.id, room.id, room.boardingHouseId);
    addEventLog('tenant:assigned', tenant.id, room.boardingHouseId);
    emitRealtimeEvent('tenant:assigned', result, { boardingHouseId: room.boardingHouseId });
    emitRealtimeEvent('room:availabilityUpdated', result.room, { boardingHouseId: room.boardingHouseId });
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ message: (error as Error).message });
  }
});

router.get('/:id/availability', requireAuth, (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const room = state.rooms.find((item) => item.id === id);
  if (!room) return res.status(404).json({ message: 'Room not found' });
  if (!canAccessBoardingHouse(req.user!, room.boardingHouseId)) return res.status(403).json({ message: 'Forbidden' });
  return res.json({ roomId: room.id, availability: room.maxCapacity - room.occupancy, occupancy: room.occupancy });
});

export default router;
