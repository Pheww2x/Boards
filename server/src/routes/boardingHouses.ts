import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { getBoardingHouseById, state } from '../services/store';

const router = Router();

router.get('/', requireAuth, requireRole('super_admin', 'owner'), (req, res) => {
  return res.json({ boardingHouses: state.boardingHouses });
});

router.post('/', requireAuth, requireRole('super_admin', 'owner'), (req, res) => {
  const payload = req.body ?? {};
  const boardingHouse = {
    id: `boarding-house-${Date.now()}`,
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

  state.boardingHouses.push(boardingHouse);
  return res.status(201).json(boardingHouse);
});

router.get('/:id', requireAuth, (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const boardingHouse = getBoardingHouseById(id);
  if (!boardingHouse) return res.status(404).json({ message: 'Boarding house not found' });
  return res.json(boardingHouse);
});

export default router;
