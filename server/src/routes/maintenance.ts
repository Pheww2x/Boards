import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { addAuditLog, addEventLog, createNotification } from '../services/store';
import BoardingHouse from '../models/BoardingHouse';
import MaintenanceRequest from '../models/MaintenanceRequest';
import Tenant from '../models/Tenant';
import { emitRealtimeEvent } from '../utils/network';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

async function canAccessRequest(user: NonNullable<Express.Request['user']>, tenantId: string) {
  const tenant = await Tenant.findOne({ id: tenantId }).exec();
  if (!tenant) return false;
  if (user.role === 'super_admin') return true;
  if (user.role === 'tenant') return tenant.userId === user.id;
  return tenant.boardingHouseId === user.boardingHouseId ||
    Boolean(await BoardingHouse.exists({ id: tenant.boardingHouseId, owner: user.id }));
}

router.get('/', requireAuth, requireRole('super_admin', 'owner', 'staff', 'tenant'), asyncHandler(async (req, res) => {
  const allRequests = await MaintenanceRequest.find().exec();
  const maintenanceRequests = [];
  for (const item of allRequests) {
    if (await canAccessRequest(req.user!, item.tenantId)) maintenanceRequests.push(item);
  }
  return res.json({ maintenanceRequests });
}));

router.post('/', requireAuth, requireRole('tenant', 'staff'), asyncHandler(async (req, res) => {
  const payload = req.body ?? {};
  const tenant = req.user?.role === 'tenant'
    ? await Tenant.findOne({ userId: req.user.id }).exec()
    : typeof payload.tenantId === 'string' ? await Tenant.findOne({ id: payload.tenantId }).exec() : null;
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  const description = typeof payload.description === 'string' ? payload.description.trim() : '';
  if (!tenant) return res.status(404).json({ message: 'Tenant profile not found' });
  if (!await canAccessRequest(req.user!, tenant.id)) return res.status(403).json({ message: 'Forbidden' });
  if (!title || !description) return res.status(400).json({ message: 'Title and description are required' });
  if (payload.roomId && tenant.roomId !== payload.roomId) return res.status(400).json({ message: 'Room is not assigned to this tenant' });

  const request = await MaintenanceRequest.create({
    id: `maintenance-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    tenantId: tenant.id,
    boardingHouseId: tenant.boardingHouseId,
    roomId: tenant.roomId,
    title,
    description,
    status: 'submitted',
    createdAt: new Date().toISOString(),
  });

  await addEventLog('maintenance:created', request.id, request.boardingHouseId);
  await addAuditLog('create-maintenance', req.user?.id ?? 'system', `Submitted maintenance request ${request.title}`);
  emitRealtimeEvent('maintenance:created', request, { boardingHouseId: request.boardingHouseId });
  return res.status(201).json(request);
}));

router.patch('/:id', requireAuth, requireRole('super_admin', 'staff', 'owner'), asyncHandler(async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const request = await MaintenanceRequest.findOne({ id }).exec();
  if (!request) return res.status(404).json({ message: 'Maintenance request not found' });
  if (!await canAccessRequest(req.user!, request.tenantId)) return res.status(403).json({ message: 'Forbidden' });
  const statuses = ['submitted', 'in_progress', 'completed'];
  if (!statuses.includes(req.body?.status)) return res.status(400).json({ message: 'Maintenance status is invalid' });

  request.status = req.body.status;
  await request.save();
  await addEventLog('maintenance:updated', request.id, request.boardingHouseId);
  await addAuditLog('update-maintenance', req.user?.id ?? 'system', `Updated maintenance request ${request.id}`);
  const tenant = await Tenant.findOne({ id: request.tenantId }).exec();
  if (tenant?.userId) {
    const notification = await createNotification(tenant.userId, 'Maintenance update', `${request.title}: ${request.status.replace('_', ' ')}`);
    emitRealtimeEvent('notification:new', notification, { userId: tenant.userId });
  }
  emitRealtimeEvent('maintenance:updated', request, { boardingHouseId: request.boardingHouseId });
  return res.json(request);
}));

export default router;
