import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { addAuditLog, addEventLog, createNotification, state } from '../services/store';
import { emitRealtimeEvent } from '../utils/network';

const router = Router();

function canAccessRequest(user: NonNullable<Express.Request['user']>, tenantId: string) {
  const tenant = state.tenants.find((item) => item.id === tenantId);
  if (!tenant) return false;
  if (user.role === 'super_admin') return true;
  if (user.role === 'tenant') return tenant.userId === user.id;
  return tenant.boardingHouseId === user.boardingHouseId ||
    state.boardingHouses.some((house) => house.id === tenant.boardingHouseId && house.owner === user.id);
}

router.get('/', requireAuth, requireRole('super_admin', 'owner', 'staff', 'tenant'), (req, res) => {
  const maintenanceRequests = state.maintenanceRequests.filter((item) => canAccessRequest(req.user!, item.tenantId));
  return res.json({ maintenanceRequests });
});

router.post('/', requireAuth, requireRole('tenant', 'staff'), (req, res) => {
  const payload = req.body ?? {};
  const tenant = req.user?.role === 'tenant'
    ? state.tenants.find((item) => item.userId === req.user?.id)
    : state.tenants.find((item) => item.id === payload.tenantId);
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  const description = typeof payload.description === 'string' ? payload.description.trim() : '';
  if (!tenant) return res.status(404).json({ message: 'Tenant profile not found' });
  if (!canAccessRequest(req.user!, tenant.id)) return res.status(403).json({ message: 'Forbidden' });
  if (!title || !description) return res.status(400).json({ message: 'Title and description are required' });
  if (payload.roomId && tenant.roomId !== payload.roomId) return res.status(400).json({ message: 'Room is not assigned to this tenant' });

  const request = {
    id: `maintenance-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    tenantId: tenant.id,
    boardingHouseId: tenant.boardingHouseId,
    roomId: tenant.roomId,
    title,
    description,
    status: 'submitted' as const,
    createdAt: new Date().toISOString(),
  };

  state.maintenanceRequests.push(request);
  addEventLog('maintenance:created', request.id, request.boardingHouseId);
  addAuditLog('create-maintenance', req.user?.id ?? 'system', `Submitted maintenance request ${request.title}`);
  emitRealtimeEvent('maintenance:created', request, { boardingHouseId: request.boardingHouseId });
  return res.status(201).json(request);
});

router.patch('/:id', requireAuth, requireRole('super_admin', 'staff', 'owner'), (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const request = state.maintenanceRequests.find((item) => item.id === id);
  if (!request) return res.status(404).json({ message: 'Maintenance request not found' });
  if (!canAccessRequest(req.user!, request.tenantId)) return res.status(403).json({ message: 'Forbidden' });
  const statuses = ['submitted', 'in_progress', 'completed'];
  if (!statuses.includes(req.body?.status)) return res.status(400).json({ message: 'Maintenance status is invalid' });

  request.status = req.body.status;
  addEventLog('maintenance:updated', request.id, request.boardingHouseId);
  addAuditLog('update-maintenance', req.user?.id ?? 'system', `Updated maintenance request ${request.id}`);
  const tenant = state.tenants.find((item) => item.id === request.tenantId);
  if (tenant?.userId) {
    emitRealtimeEvent('notification:new', createNotification(tenant.userId, 'Maintenance update', `${request.title}: ${request.status.replace('_', ' ')}`), { userId: tenant.userId });
  }
  emitRealtimeEvent('maintenance:updated', request, { boardingHouseId: request.boardingHouseId });
  return res.json(request);
});

export default router;
