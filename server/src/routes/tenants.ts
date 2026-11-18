import { Router, type Request } from 'express';
import { hashPassword, requireAuth, requireRole } from '../middleware/auth';
import { addAuditLog, addEventLog, assignTenantToRoom, checkOutTenant, createNotification, state, transferTenantToRoom } from '../services/store';
import { emitRealtimeEvent } from '../utils/network';

const router = Router();

function canAccessTenant(req: Request, tenant: (typeof state.tenants)[number]) {
  const user = req.user!;
  if (user.role === 'super_admin') return true;
  if (user.role === 'tenant') return tenant.userId === user.id;
  return tenant.boardingHouseId === user.boardingHouseId ||
    state.boardingHouses.some((house) => house.id === tenant.boardingHouseId && house.owner === user.id);
}

router.get('/', requireAuth, requireRole('super_admin', 'owner', 'staff', 'tenant'), (req, res) => {
  const tenants = state.tenants.filter((tenant) => canAccessTenant(req, tenant));
  return res.json({ tenants });
});

router.post('/', requireAuth, requireRole('super_admin', 'owner', 'staff'), (req, res) => {
  const payload = req.body ?? {};
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  const email = typeof payload.email === 'string' ? payload.email.trim() : '';
  const password = typeof payload.password === 'string' ? payload.password : '';
  if (!name || !email || password.length < 8) {
    return res.status(400).json({ message: 'Tenant name, email, and a password of at least 8 characters are required' });
  }
  if (state.users.some((user) => user.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ message: 'An account with that email already exists' });
  }

  const boardingHouseId = req.user?.role === 'super_admin'
    ? payload.boardingHouseId ?? state.boardingHouses[0]?.id
    : req.user?.boardingHouseId;
  if (!boardingHouseId || !state.boardingHouses.some((house) => house.id === boardingHouseId)) {
    return res.status(400).json({ message: 'A valid boarding house is required' });
  }

  const tenantUserId = `user-tenant-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const tenant = {
    id: `tenant-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    userId: tenantUserId,
    name,
    email,
    phone: typeof payload.phone === 'string' ? payload.phone.trim() : '',
    boardingHouseId,
    status: 'active' as const,
    createdAt: new Date().toISOString(),
  };

  state.users.push({
    id: tenantUserId,
    name,
    email,
    passwordHash: hashPassword(password),
    role: 'tenant',
    boardingHouseId,
    createdAt: new Date().toISOString(),
  });
  state.tenants.push(tenant);
  if (typeof payload.roomId === 'string' && payload.roomId) {
    try {
      assignTenantToRoom(tenant.id, payload.roomId, boardingHouseId);
      addEventLog('tenant:assigned', tenant.id, boardingHouseId);
    } catch (error) {
      state.tenants.splice(state.tenants.indexOf(tenant), 1);
      state.users.splice(state.users.findIndex((user) => user.id === tenantUserId), 1);
      return res.status(400).json({ message: (error as Error).message });
    }
  }

  addEventLog('tenant:registered', tenant.id, tenant.boardingHouseId);
  addAuditLog('register-tenant', req.user?.id ?? 'system', `Registered tenant ${tenant.name}`);
  emitRealtimeEvent('tenant:registered', tenant, { boardingHouseId: tenant.boardingHouseId });
  return res.status(201).json(tenant);
});

router.get('/:id', requireAuth, (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenant = state.tenants.find((item) => item.id === id);
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
  if (!canAccessTenant(req, tenant)) return res.status(403).json({ message: 'Forbidden' });
  return res.json(tenant);
});

router.patch('/:id', requireAuth, requireRole('super_admin', 'owner', 'staff'), (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenant = state.tenants.find((item) => item.id === id);
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
  if (!canAccessTenant(req, tenant)) return res.status(403).json({ message: 'Forbidden' });
  Object.assign(tenant, req.body);
  addEventLog('tenant:updated', tenant.id, tenant.boardingHouseId);
  addAuditLog('update-tenant', req.user?.id ?? 'system', `Updated tenant ${tenant.name}`);
  return res.json(tenant);
});

router.post('/:id/transfer', requireAuth, requireRole('super_admin', 'owner', 'staff'), (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenant = state.tenants.find((item) => item.id === id);
  const targetRoomId = typeof req.body?.targetRoomId === 'string' ? req.body.targetRoomId : '';
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
  if (!canAccessTenant(req, tenant)) return res.status(403).json({ message: 'Forbidden' });
  if (!targetRoomId) return res.status(400).json({ message: 'Target room is required' });

  try {
    const result = transferTenantToRoom(tenant.id, targetRoomId);
    addEventLog('tenant:transferred', tenant.id, tenant.boardingHouseId);
    addAuditLog('transfer-tenant', req.user?.id ?? 'system', `Transferred ${tenant.name} to room ${result.toRoom.roomNumber}`);
    emitRealtimeEvent('tenant:transferred', result, { boardingHouseId: tenant.boardingHouseId });
    emitRealtimeEvent('room:availabilityUpdated', result.fromRoom, { boardingHouseId: tenant.boardingHouseId });
    emitRealtimeEvent('room:availabilityUpdated', result.toRoom, { boardingHouseId: tenant.boardingHouseId });
    if (tenant.userId) {
      const notification = createNotification(tenant.userId, 'Room transfer', `You have been moved to room ${result.toRoom.roomNumber}.`);
      emitRealtimeEvent('notification:new', notification, { userId: tenant.userId });
    }
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ message: (error as Error).message });
  }
});

router.post('/:id/checkout', requireAuth, requireRole('super_admin', 'owner', 'staff'), (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenant = state.tenants.find((item) => item.id === id);
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
  if (!canAccessTenant(req, tenant)) return res.status(403).json({ message: 'Forbidden' });

  try {
    const result = checkOutTenant(tenant.id);
    addEventLog('tenant:checkedOut', tenant.id, tenant.boardingHouseId);
    addAuditLog('check-out-tenant', req.user?.id ?? 'system', `Checked out tenant ${tenant.name}`);
    emitRealtimeEvent('tenant:checkedOut', result, { boardingHouseId: tenant.boardingHouseId });
    if (result.room) emitRealtimeEvent('room:availabilityUpdated', result.room, { boardingHouseId: tenant.boardingHouseId });
    if (tenant.userId) {
      const notification = createNotification(tenant.userId, 'Checked out', 'Your room assignment has ended. Your account and payment history are retained.');
      emitRealtimeEvent('notification:new', notification, { userId: tenant.userId });
    }
    return res.json(result);
  } catch (error) {
    return res.status(409).json({ message: (error as Error).message });
  }
});

export default router;
