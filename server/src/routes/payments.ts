import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { addAuditLog, addEventLog, createNotification } from '../services/store';
import BoardingHouse from '../models/BoardingHouse';
import Payment from '../models/Payment';
import Room from '../models/Room';
import Tenant from '../models/Tenant';
import { emitRealtimeEvent } from '../utils/network';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

async function canAccessTenant(user: NonNullable<Express.Request['user']>, tenantId: string) {
  const tenant = await Tenant.findOne({ id: tenantId }).exec();
  if (!tenant) return false;
  if (user.role === 'super_admin') return true;
  if (user.role === 'tenant') return tenant.userId === user.id;
  return tenant.boardingHouseId === user.boardingHouseId ||
    Boolean(await BoardingHouse.exists({ id: tenant.boardingHouseId, owner: user.id }));
}

router.get('/', requireAuth, requireRole('super_admin', 'owner', 'staff', 'tenant'), asyncHandler(async (req, res) => {
  const allPayments = await Payment.find().exec();
  const payments = [];
  for (const payment of allPayments) {
    if (await canAccessTenant(req.user!, payment.tenantId)) payments.push(payment);
  }
  return res.json({ payments });
}));

router.post('/', requireAuth, requireRole('super_admin', 'staff', 'owner'), asyncHandler(async (req, res) => {
  const payload = req.body ?? {};
  const tenant = typeof payload.tenantId === 'string'
    ? await Tenant.findOne({ id: payload.tenantId }).exec()
    : null;
  if (!tenant) return res.status(400).json({ message: 'A valid tenant is required' });
  if (!tenant.roomId) return res.status(400).json({ message: 'The tenant must be assigned to a room before recording a payment' });
  const room = await Room.findOne({ id: tenant.roomId }).exec();
  const amount = Number(payload.amount);
  const allowedMethods = ['cash', 'gcash', 'bank_transfer', 'other'];

  if (!room) return res.status(400).json({ message: 'The tenant\'s assigned room was not found' });
  if (!await canAccessTenant(req.user!, tenant.id) || tenant.boardingHouseId !== room.boardingHouseId || tenant.roomId !== room.id) {
    return res.status(403).json({ message: 'Tenant and room assignment is not accessible' });
  }
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: 'Amount must be greater than zero' });
  if (!allowedMethods.includes(payload.method)) return res.status(400).json({ message: 'Payment method is invalid' });

  const payment = await Payment.create({
    id: `payment-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    tenantId: tenant.id,
    roomId: room.id,
    boardingHouseId: tenant.boardingHouseId,
    amount,
    method: payload.method,
    status: payload.method === 'gcash' || payload.method === 'bank_transfer' ? 'pending' : 'confirmed',
    createdAt: new Date().toISOString(),
  });

  await addEventLog('payment:recorded', payment.id, payment.boardingHouseId);
  await addAuditLog('record-payment', req.user?.id ?? 'system', `Recorded payment for ${tenant.name}`);
  if (tenant.userId) {
    const notification = await createNotification(
      tenant.userId,
      'Payment recorded',
      `${payment.status === 'pending' ? 'Payment submitted for verification' : 'Payment confirmed'}: ₱${amount.toLocaleString()}`
    );
    emitRealtimeEvent('notification:new', notification, { userId: tenant.userId });
  }
  emitRealtimeEvent('payment:recorded', payment, { boardingHouseId: payment.boardingHouseId });
  return res.status(201).json(payment);
}));

router.patch('/:id/confirm', requireAuth, requireRole('super_admin', 'owner', 'staff'), asyncHandler(async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const payment = await Payment.findOne({ id }).exec();
  if (!payment) return res.status(404).json({ message: 'Payment not found' });
  if (!await canAccessTenant(req.user!, payment.tenantId)) return res.status(403).json({ message: 'Forbidden' });
  if (payment.status !== 'pending') return res.status(409).json({ message: 'Only pending payments can be confirmed' });

  payment.status = 'confirmed';
  await payment.save();
  await addEventLog('payment:confirmed', payment.id, payment.boardingHouseId);
  await addAuditLog('confirm-payment', req.user?.id ?? 'system', `Confirmed payment ${payment.id}`);
  const tenant = await Tenant.findOne({ id: payment.tenantId }).exec();
  if (tenant?.userId) {
    const notification = await createNotification(tenant.userId, 'Payment confirmed', `₱${payment.amount.toLocaleString()} payment confirmed.`);
    emitRealtimeEvent('notification:new', notification, { userId: tenant.userId });
  }
  emitRealtimeEvent('payment:recorded', payment, { boardingHouseId: payment.boardingHouseId });
  return res.json(payment);
}));

export default router;
