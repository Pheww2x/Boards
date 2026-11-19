import { Router, type Request } from 'express';
import { hashPassword, requireAuth, requireRole } from '../middleware/auth';
import { addAuditLog, addEventLog, checkOutTenant, createNotification, createTenantWithAccount, transferTenantToRoom } from '../services/store';
import BoardingHouse from '../models/BoardingHouse';
import Tenant, { type ITenant } from '../models/Tenant';
import User from '../models/User';
import { emitRealtimeEvent } from '../utils/network';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

async function canAccessTenant(req: Request, tenant: ITenant) {
  const user = req.user!;
  if (user.role === 'super_admin') return true;
  if (user.role === 'tenant') return tenant.userId === user.id;
  return tenant.boardingHouseId === user.boardingHouseId ||
    Boolean(await BoardingHouse.exists({ id: tenant.boardingHouseId, owner: user.id }));
}

router.get('/', requireAuth, requireRole('super_admin', 'owner', 'staff', 'tenant'), asyncHandler(async (req, res) => {
  const allTenants = await Tenant.find().exec();
  const tenants = [];
  for (const tenant of allTenants) {
    if (await canAccessTenant(req, tenant)) tenants.push(tenant);
  }
  return res.json({ tenants });
}));

router.post('/', requireAuth, requireRole('super_admin', 'owner', 'staff'), asyncHandler(async (req, res) => {
  const payload = req.body ?? {};
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  const email = typeof payload.email === 'string' ? payload.email.trim() : '';
  const password = typeof payload.password === 'string' ? payload.password : '';
  if (!name || !email || password.length < 8) {
    return res.status(400).json({ message: 'Tenant name, email, and a password of at least 8 characters are required' });
  }
  const users = await User.find().select({ email: 1 }).exec();
  if (users.some((user) => user.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ message: 'An account with that email already exists' });
  }

  const boardingHouseId = req.user?.role === 'super_admin'
    ? payload.boardingHouseId ?? (await BoardingHouse.findOne().exec())?.id
    : req.user?.boardingHouseId;
  if (!boardingHouseId || !await BoardingHouse.exists({ id: boardingHouseId })) {
    return res.status(400).json({ message: 'A valid boarding house is required' });
  }

  const tenantUserId = `user-tenant-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const tenantId = `tenant-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const now = new Date().toISOString();
  const tenantData = {
    id: tenantId,
    userId: tenantUserId,
    name,
    email,
    phone: typeof payload.phone === 'string' ? payload.phone.trim() : '',
    boardingHouseId,
    status: 'active' as const,
    createdAt: now,
  };

  let tenant;
  try {
    const result = await createTenantWithAccount({
      id: tenantUserId,
      name,
      email,
      passwordHash: hashPassword(password),
      role: 'tenant',
      boardingHouseId,
      createdAt: now,
    }, tenantData, typeof payload.roomId === 'string' && payload.roomId ? payload.roomId : undefined);
    tenant = result.tenant;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      return res.status(409).json({ message: 'An account with that email already exists' });
    }
    if (error instanceof Error && [
      'Tenant or room not found',
      'Tenant already has an active room assignment',
      'Room does not belong to this boarding house',
      'Room is unavailable or at full capacity',
    ].includes(error.message)) {
      return res.status(400).json({ message: error.message });
    }
    throw error;
  }

  if (typeof payload.roomId === 'string' && payload.roomId) {
    await addEventLog('tenant:assigned', tenant.id, boardingHouseId);
  }
  await addEventLog('tenant:registered', tenant.id, tenant.boardingHouseId);
  await addAuditLog('register-tenant', req.user?.id ?? 'system', `Registered tenant ${tenant.name}`);
  emitRealtimeEvent('tenant:registered', tenant, { boardingHouseId: tenant.boardingHouseId });
  return res.status(201).json(tenant);
}));

router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenant = await Tenant.findOne({ id }).exec();
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
  if (!await canAccessTenant(req, tenant)) return res.status(403).json({ message: 'Forbidden' });
  return res.json(tenant);
}));

router.patch('/:id', requireAuth, requireRole('super_admin', 'owner', 'staff'), asyncHandler(async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenant = await Tenant.findOne({ id }).exec();
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
  if (!await canAccessTenant(req, tenant)) return res.status(403).json({ message: 'Forbidden' });
  Object.assign(tenant, req.body);
  await tenant.save();
  await addEventLog('tenant:updated', tenant.id, tenant.boardingHouseId);
  await addAuditLog('update-tenant', req.user?.id ?? 'system', `Updated tenant ${tenant.name}`);
  return res.json(tenant);
}));

router.post('/:id/transfer', requireAuth, requireRole('super_admin', 'owner', 'staff'), asyncHandler(async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenant = await Tenant.findOne({ id }).exec();
  const targetRoomId = typeof req.body?.targetRoomId === 'string' ? req.body.targetRoomId : '';
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
  if (!await canAccessTenant(req, tenant)) return res.status(403).json({ message: 'Forbidden' });
  if (!targetRoomId) return res.status(400).json({ message: 'Target room is required' });

  try {
    const result = await transferTenantToRoom(tenant.id, targetRoomId);
    await addEventLog('tenant:transferred', tenant.id, tenant.boardingHouseId);
    await addAuditLog('transfer-tenant', req.user?.id ?? 'system', `Transferred ${tenant.name} to room ${result.toRoom.roomNumber}`);
    emitRealtimeEvent('tenant:transferred', result, { boardingHouseId: tenant.boardingHouseId });
    emitRealtimeEvent('room:availabilityUpdated', result.fromRoom, { boardingHouseId: tenant.boardingHouseId });
    emitRealtimeEvent('room:availabilityUpdated', result.toRoom, { boardingHouseId: tenant.boardingHouseId });
    if (tenant.userId) {
      const notification = await createNotification(tenant.userId, 'Room transfer', `You have been moved to room ${result.toRoom.roomNumber}.`);
      emitRealtimeEvent('notification:new', notification, { userId: tenant.userId });
    }
    return res.json(result);
  } catch (error) {
    if (error instanceof Error && [
      'Tenant or room not found',
      'Only active tenants can be transferred',
      'Tenant is already assigned to this room',
      'Target room must be in the same boarding house',
      'Target room has no available capacity',
    ].includes(error.message)) {
      return res.status(400).json({ message: error.message });
    }
    throw error;
  }
}));

router.post('/:id/checkout', requireAuth, requireRole('super_admin', 'owner', 'staff'), asyncHandler(async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenant = await Tenant.findOne({ id }).exec();
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
  if (!await canAccessTenant(req, tenant)) return res.status(403).json({ message: 'Forbidden' });

  try {
    const result = await checkOutTenant(tenant.id);
    await addEventLog('tenant:checkedOut', tenant.id, tenant.boardingHouseId);
    await addAuditLog('check-out-tenant', req.user?.id ?? 'system', `Checked out tenant ${tenant.name}`);
    emitRealtimeEvent('tenant:checkedOut', result, { boardingHouseId: tenant.boardingHouseId });
    if (result.room) emitRealtimeEvent('room:availabilityUpdated', result.room, { boardingHouseId: tenant.boardingHouseId });
    if (tenant.userId) {
      const notification = await createNotification(tenant.userId, 'Checked out', 'Your room assignment has ended. Your account and payment history are retained.');
      emitRealtimeEvent('notification:new', notification, { userId: tenant.userId });
    }
    return res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'Tenant is already checked out') {
      return res.status(409).json({ message: error.message });
    }
    throw error;
  }
}));

export default router;
