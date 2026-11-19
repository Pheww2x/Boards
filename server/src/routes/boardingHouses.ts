import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import BoardingHouse from '../models/BoardingHouse';
import { getBoardingHouseById } from '../services/store';
import { asyncHandler } from '../utils/asyncHandler';
import { createId } from '../utils/id';

const router = Router();

router.get('/', requireAuth, requireRole('super_admin', 'owner'), asyncHandler(async (_req, res) => {
  return res.json({ boardingHouses: await BoardingHouse.find().exec() });
}));

router.post('/', requireAuth, requireRole('super_admin', 'owner'), asyncHandler(async (req, res) => {
  const payload = req.body ?? {};
  const boardingHouse = {
    id: createId('boarding-house'),
    name: payload.name ?? 'New Boarding House',
    owner: payload.owner ?? 'owner',
    contact: payload.contact ?? 'N/A',
    address: payload.address ?? 'Address missing',
    coordinates: payload.coordinates ?? { lat: 0, lng: 0 },
    floors: Number(payload.floors ?? 1),
    totalRooms: Number(payload.totalRooms ?? 0),
    status: payload.status ?? 'operational',
    createdAt: new Date().toISOString(),
  };

  const created = await BoardingHouse.create(boardingHouse);
  return res.status(201).json(created);
}));

router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const boardingHouse = await getBoardingHouseById(id);
  if (!boardingHouse) return res.status(404).json({ message: 'Boarding house not found' });
  return res.json(boardingHouse);
}));

export default router;
