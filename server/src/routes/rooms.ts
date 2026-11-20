import { Router } from 'express';
import { requireAuth, requireRole, type Room as RoomData } from '../middleware/auth';
import { addAuditLog, addEventLog, assignTenantToRoom } from '../services/store';
import BoardingHouse from '../models/BoardingHouse';
import Room from '../models/Room';
import Tenant from '../models/Tenant';
import { emitRealtimeEvent } from '../utils/network';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

async function canAccessBoardingHouse(user: NonNullable<Express.Request['user']>, boardingHouseId: string) {
  if (user.role === 'super_admin') return true;
  if (user.boardingHouseId === boardingHouseId) return true;
  return Boolean(await BoardingHouse.exists({ id: boardingHouseId, owner: user.id }));
}

router.get('/', requireAuth, requireRole('super_admin', 'owner', 'staff', 'tenant'), asyncHandler(async (req, res) => {
  if (req.user?.role === 'tenant') {
    const tenant = await Tenant.findOne({ userId: req.user.id }).exec();
    const room = tenant?.roomId ? await Room.findOne({ id: tenant.roomId }).exec() : null;
    const boardingHouses = tenant
      ? await BoardingHouse.find({ id: tenant.boardingHouseId }).exec()
      : [];
    return res.json({ rooms: room ? [room] : [], boardingHouses });
  }

  const [rooms, boardingHouses] = await Promise.all([Room.find().exec(), BoardingHouse.find().exec()]);
  const visibleRooms = [];
  for (const room of rooms) {
    if (await canAccessBoardingHouse(req.user!, room.boardingHouseId)) visibleRooms.push(room);
  }
  const visibleHouses = [];
  for (const house of boardingHouses) {
    if (await canAccessBoardingHouse(req.user!, house.id)) visibleHouses.push(house);
  }
  return res.json({ rooms: visibleRooms, boardingHouses: visibleHouses });
}));

router.post('/', requireAuth, requireRole('super_admin', 'owner'), asyncHandler(async (req, res) => {
  const payload = req.body ?? {};
  const requestedBoardingHouseId = typeof payload.boardingHouseId === 'string'
    ? payload.boardingHouseId.trim()
    : '';
  let boardingHouseId = req.user?.role === 'super_admin'
    ? requestedBoardingHouseId || (await BoardingHouse.findOne().exec())?.id
    : requestedBoardingHouseId || req.user?.boardingHouseId;
  let boardingHouse = boardingHouseId
    ? await BoardingHouse.findOne({ id: boardingHouseId }).exec()
    : null;

  if (boardingHouse && req.user?.role !== 'super_admin' &&
    !await canAccessBoardingHouse(req.user!, boardingHouse.id)) {
    return res.status(403).json({ message: 'You can only create rooms in your assigned or owned boarding house' });
  }

  if (!boardingHouse && req.user?.role === 'owner' && !requestedBoardingHouseId) {
    const ownedHouses = await BoardingHouse.find({ owner: req.user.id }).limit(2).exec();
    if (ownedHouses.length === 1) {
      boardingHouse = ownedHouses[0];
      boardingHouseId = boardingHouse.id;
    } else if (ownedHouses.length > 1) {
      return res.status(400).json({ message: 'Select one of your boarding houses before creating a room' });
    }
  }

  const roomNumber = typeof payload.roomNumber === 'string' ? payload.roomNumber.trim() : '';
  const maxCapacity = Number(payload.maxCapacity);
  const monthlyRent = Number(payload.monthlyRent);
  const floor = Number(payload.floor);

  if (!boardingHouse) {
    if (!boardingHouseId) {
      return res.status(400).json({ message: 'No boarding house is assigned to this account. Ask an administrator to link it to an existing boarding house.' });
    }
    return res.status(400).json({ message: 'The selected or assigned boarding house was not found. Use an existing boarding house ID.' });
  }
  if (!roomNumber || !Number.isInteger(maxCapacity) || maxCapacity < 1 || !Number.isInteger(floor) || floor < 1 || !Number.isFinite(monthlyRent) || monthlyRent < 0) {
    return res.status(400).json({ message: 'Room number, floor, capacity, and rent must be valid' });
  }
  if (await Room.exists({ boardingHouseId: boardingHouse.id, roomNumber })) {
    return res.status(409).json({ message: 'That room number already exists in this boarding house' });
  }

  const roomData: RoomData = {
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

  let room;
  try {
    room = await Room.create(roomData);
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      return res.status(409).json({ message: 'That room number already exists in this boarding house' });
    }
    throw error;
  }
  boardingHouse.totalRooms = await Room.countDocuments({ boardingHouseId: boardingHouse.id }).exec();
  await boardingHouse.save();
  await addEventLog('room:created', room.id, room.boardingHouseId);
  await addAuditLog('create-room', req.user?.id ?? 'system', `Created room ${room.roomNumber}`);
  emitRealtimeEvent('room:created', room, { boardingHouseId: room.boardingHouseId });
  emitRealtimeEvent('room:availabilityUpdated', room, { boardingHouseId: room.boardingHouseId });
  return res.status(201).json(room);
}));

router.patch('/:id', requireAuth, requireRole('super_admin', 'owner', 'staff'), asyncHandler(async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const room = await Room.findOne({ id }).exec();
  if (!room) return res.status(404).json({ message: 'Room not found' });
  if (!await canAccessBoardingHouse(req.user!, room.boardingHouseId)) return res.status(403).json({ message: 'Forbidden' });

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

  await room.save();
  await addEventLog('room:availabilityUpdated', room.id, room.boardingHouseId);
  emitRealtimeEvent('room:availabilityUpdated', room, { boardingHouseId: room.boardingHouseId });
  return res.json(room);
}));

router.post('/:id/assign', requireAuth, requireRole('super_admin', 'owner', 'staff'), asyncHandler(async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (typeof req.body?.tenantId !== 'string') return res.status(404).json({ message: 'Room or tenant not found' });
  const [room, tenant] = await Promise.all([
    Room.findOne({ id }).exec(),
    Tenant.findOne({ id: req.body?.tenantId }).exec(),
  ]);
  if (!room || !tenant) return res.status(404).json({ message: 'Room or tenant not found' });
  if (!await canAccessBoardingHouse(req.user!, room.boardingHouseId) || tenant.boardingHouseId !== room.boardingHouseId) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    const result = await assignTenantToRoom(tenant.id, room.id, room.boardingHouseId);
    await addEventLog('tenant:assigned', tenant.id, room.boardingHouseId);
    emitRealtimeEvent('tenant:assigned', result, { boardingHouseId: room.boardingHouseId });
    emitRealtimeEvent('room:availabilityUpdated', result.room, { boardingHouseId: room.boardingHouseId });
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ message: (error as Error).message });
  }
}));

router.get('/:id/availability', requireAuth, asyncHandler(async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const room = await Room.findOne({ id }).exec();
  if (!room) return res.status(404).json({ message: 'Room not found' });
  if (!await canAccessBoardingHouse(req.user!, room.boardingHouseId)) return res.status(403).json({ message: 'Forbidden' });
  return res.json({ roomId: room.id, availability: room.maxCapacity - room.occupancy, occupancy: room.occupancy });
}));

export default router;
