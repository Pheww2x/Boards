import mongoose, { type ClientSession } from 'mongoose';
import { hashPassword, type Room as RoomData, type Notification as NotificationData } from '../middleware/auth';
import User from '../models/User';
import BoardingHouse from '../models/BoardingHouse';
import Room from '../models/Room';
import Tenant from '../models/Tenant';
import Reservation from '../models/Reservation';
import Payment from '../models/Payment';
import MaintenanceRequest from '../models/MaintenanceRequest';
import Notification from '../models/Notification';
import Announcement from '../models/Announcement';
import EventLog from '../models/EventLog';
import AuditLog from '../models/AuditLog';
import RoomAssignment from '../models/RoomAssignment';
import { createId } from '../utils/id';

async function inTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  let result!: T;
  try {
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export async function getUserByEmail(email: string) {
  return User.findOne({ email: email.toLowerCase() }).exec();
}

export async function getUserById(id: string) {
  return User.findOne({ id }).exec();
}

export async function seedDemoData() {
  const adminId = 'user-admin';
  const ownerId = 'user-owner';
  const staffId = 'user-staff';
  const tenantUserId = 'user-tenant';
  const boardingHouseId = 'boarding-house-1';
  const now = new Date().toISOString();

  const users = [
    { id: adminId, name: 'System Admin', email: 'admin@boardhouse.local', passwordHash: hashPassword('admin123'), role: 'super_admin' as const, createdAt: now },
    { id: ownerId, name: 'Owner Manager', email: 'owner@boardhouse.local', passwordHash: hashPassword('owner123'), role: 'owner' as const, boardingHouseId, createdAt: now },
    { id: staffId, name: 'Staff Agent', email: 'staff@boardhouse.local', passwordHash: hashPassword('staff123'), role: 'staff' as const, boardingHouseId, createdAt: now },
    { id: tenantUserId, name: 'Tenant User', email: 'tenant@boardhouse.local', passwordHash: hashPassword('tenant123'), role: 'tenant' as const, boardingHouseId, createdAt: now },
  ];
  for (const user of users) {
    await User.updateOne({ id: user.id }, { $setOnInsert: user }, { upsert: true }).exec();
  }

  await BoardingHouse.updateOne(
    { id: boardingHouseId },
    {
      $setOnInsert: {
        id: boardingHouseId,
        name: 'Sunrise Residency',
        owner: ownerId,
        contact: '+639171234567',
        address: '123 Rizal Street, Davao City',
        coordinates: { lat: 7.1907, lng: 125.4553 },
        floors: 3,
        totalRooms: 12,
        status: 'operational',
        createdAt: now,
      },
    },
    { upsert: true }
  ).exec();

  const rooms: RoomData[] = [
    { id: 'room-101', boardingHouseId, roomNumber: '101', floor: 1, type: 'single', maxCapacity: 1, occupancy: 0, monthlyRent: 5500, facilities: ['Aircon', 'Desk'], description: 'Single room near lobby', status: 'available', createdAt: now },
    { id: 'room-201', boardingHouseId, roomNumber: '201', floor: 2, type: 'double', maxCapacity: 2, occupancy: 1, monthlyRent: 7500, facilities: ['Aircon', 'Bath'], description: 'Double room with veranda', status: 'partially_occupied', createdAt: now },
    { id: 'room-301', boardingHouseId, roomNumber: '301', floor: 3, type: 'suite', maxCapacity: 2, occupancy: 2, monthlyRent: 9900, facilities: ['Aircon', 'Kitchenette'], description: 'Premium suite', status: 'occupied', createdAt: now },
  ];
  for (const room of rooms) {
    await Room.updateOne({ id: room.id }, { $setOnInsert: room }, { upsert: true }).exec();
  }

  await Tenant.updateOne(
    { id: 'tenant-1' },
    {
      $setOnInsert: {
        id: 'tenant-1',
        userId: tenantUserId,
        name: 'Maria Dela Cruz',
        email: 'maria@example.com',
        phone: '+63999',
        boardingHouseId,
        roomId: 'room-201',
        status: 'active',
        createdAt: now,
      },
    },
    { upsert: true }
  ).exec();

  await RoomAssignment.updateOne(
    { id: 'assignment-demo-1' },
    {
      $setOnInsert: {
        id: 'assignment-demo-1',
        tenantId: 'tenant-1',
        roomId: 'room-201',
        boardingHouseId,
        assignedAt: now,
      },
    },
    { upsert: true }
  ).exec();
  await Announcement.updateOne(
    { id: 'announcement-1' },
    { $setOnInsert: { id: 'announcement-1', message: 'Monthly dues are due on the 10th.', createdAt: now } },
    { upsert: true }
  ).exec();
  await Notification.updateOne(
    { id: 'notification-demo' },
    { $setOnInsert: { id: 'notification-demo', userId: ownerId, title: 'Demo system ready', message: 'The boarding house dashboard is live.', createdAt: now } },
    { upsert: true }
  ).exec();
  await AuditLog.updateOne(
    { id: 'audit-1' },
    { $setOnInsert: { id: 'audit-1', action: 'seed-demo-data', actorId: adminId, details: 'Initialized demo boarding house data', createdAt: now } },
    { upsert: true }
  ).exec();
}

export async function addEventLog(eventType: string, entityId?: string, boardingHouseId?: string) {
  const latest = await EventLog.findOne().sort({ sequence: -1 }).select({ sequence: 1 }).exec();
  const now = new Date().toISOString();
  return EventLog.create({
    id: createId('event'),
    eventId: `${eventType}-${Date.now()}`,
    eventType,
    entityId,
    boardingHouseId,
    sequence: (latest?.sequence ?? 0) + 1,
    createdAt: now,
  });
}

export async function addAuditLog(action: string, actorId: string, details: string) {
  return AuditLog.create({
    id: createId('audit'),
    action,
    actorId,
    details,
    createdAt: new Date().toISOString(),
  });
}

export async function createNotification(userId: string, title: string, message: string): Promise<NotificationData> {
  return Notification.create({
    id: createId('notice'),
    userId,
    title,
    message,
    createdAt: new Date().toISOString(),
  });
}

export async function getRoomById(roomId: string) {
  return Room.findOne({ id: roomId }).exec();
}

async function assignWithinSession(tenantId: string, roomId: string, boardingHouseId: string, session: ClientSession) {
  const room = await Room.findOne({ id: roomId }).session(session).exec();
  const tenant = await Tenant.findOne({ id: tenantId }).session(session).exec();
  if (!room || !tenant) throw new Error('Tenant or room not found');
  if (tenant.roomId && tenant.status === 'active') {
    throw new Error('Tenant already has an active room assignment');
  }
  if (room.boardingHouseId !== boardingHouseId) {
    throw new Error('Room does not belong to this boarding house');
  }
  if (room.status === 'maintenance' || room.maxCapacity - room.occupancy <= 0) {
    throw new Error('Room is unavailable or at full capacity');
  }

  room.occupancy += 1;
  room.status = room.occupancy >= room.maxCapacity ? 'occupied' : 'partially_occupied';
  tenant.roomId = roomId;
  tenant.status = 'active';
  tenant.boardingHouseId = boardingHouseId;
  await room.save({ session });
  await tenant.save({ session });
  await RoomAssignment.create([{
    id: createId('assignment'),
    tenantId,
    roomId,
    boardingHouseId,
    assignedAt: new Date().toISOString(),
  }], { session });
  return { room, tenant };
}

export async function assignTenantToRoom(tenantId: string, roomId: string, boardingHouseId: string) {
  return inTransaction((session) => assignWithinSession(tenantId, roomId, boardingHouseId, session));
}

function updateRoomOccupancyStatus(room: RoomData) {
  if (room.status === 'maintenance') return;
  room.status = room.occupancy <= 0
    ? 'available'
    : room.occupancy >= room.maxCapacity
      ? 'occupied'
      : 'partially_occupied';
}

async function closeActiveRoomAssignment(tenantId: string, endedAt: string, endReason: 'transfer' | 'check_out', session: ClientSession) {
  const assignment = await RoomAssignment.findOne({ tenantId, endedAt: { $exists: false } })
    .sort({ assignedAt: -1 })
    .session(session)
    .exec();
  if (assignment) {
    assignment.endedAt = endedAt;
    assignment.endReason = endReason;
    await assignment.save({ session });
  }
}

export async function transferTenantToRoom(tenantId: string, targetRoomId: string) {
  return inTransaction(async (session) => {
    const tenant = await Tenant.findOne({ id: tenantId }).session(session).exec();
    const targetRoom = await Room.findOne({ id: targetRoomId }).session(session).exec();
    const currentRoom = tenant?.roomId
      ? await Room.findOne({ id: tenant.roomId }).session(session).exec()
      : null;
    if (!tenant || !currentRoom || !targetRoom) throw new Error('Tenant or room not found');
    if (tenant.status !== 'active') throw new Error('Only active tenants can be transferred');
    if (currentRoom.id === targetRoom.id) throw new Error('Tenant is already assigned to this room');
    if (targetRoom.boardingHouseId !== tenant.boardingHouseId) throw new Error('Target room must be in the same boarding house');
    if (targetRoom.status === 'maintenance' || targetRoom.occupancy >= targetRoom.maxCapacity) {
      throw new Error('Target room has no available capacity');
    }

    const movedAt = new Date().toISOString();
    currentRoom.occupancy = Math.max(0, currentRoom.occupancy - 1);
    updateRoomOccupancyStatus(currentRoom);
    targetRoom.occupancy += 1;
    updateRoomOccupancyStatus(targetRoom);
    await closeActiveRoomAssignment(tenant.id, movedAt, 'transfer', session);
    tenant.roomId = targetRoom.id;
    await currentRoom.save({ session });
    await targetRoom.save({ session });
    await tenant.save({ session });
    await RoomAssignment.create([{
      id: createId('assignment'),
      tenantId: tenant.id,
      roomId: targetRoom.id,
      boardingHouseId: tenant.boardingHouseId,
      assignedAt: movedAt,
    }], { session });

    return { tenant, fromRoom: currentRoom, toRoom: targetRoom };
  });
}

export async function checkOutTenant(tenantId: string) {
  return inTransaction(async (session) => {
    const tenant = await Tenant.findOne({ id: tenantId }).session(session).exec();
    if (!tenant) throw new Error('Tenant not found');
    if (tenant.status === 'checked_out') throw new Error('Tenant is already checked out');

    const room = tenant.roomId ? await Room.findOne({ id: tenant.roomId }).session(session).exec() : undefined;
    const checkedOutAt = new Date().toISOString();
    if (room) {
      room.occupancy = Math.max(0, room.occupancy - 1);
      updateRoomOccupancyStatus(room);
      await closeActiveRoomAssignment(tenant.id, checkedOutAt, 'check_out', session);
      await room.save({ session });
    }
    tenant.roomId = undefined;
    tenant.status = 'checked_out';
    await tenant.save({ session });

    return { tenant, room, checkedOutAt };
  });
}

export async function getRoomsForBoardingHouse(boardingHouseId?: string) {
  return boardingHouseId ? Room.find({ boardingHouseId }).exec() : Room.find().exec();
}

export async function getDashboardSummary() {
  const [rooms, tenants, payments] = await Promise.all([
    Room.find().exec(),
    Tenant.find().exec(),
    Payment.find().exec(),
  ]);
  return {
    totalRooms: rooms.length,
    availableRooms: rooms.filter((room) => room.status === 'available').length,
    occupiedRooms: rooms.filter((room) => room.status === 'occupied' || room.status === 'partially_occupied').length,
    totalTenants: tenants.length,
    totalPayments: payments.reduce((sum, payment) => sum + payment.amount, 0),
  };
}

export async function getBoardingHouseById(id: string) {
  return BoardingHouse.findOne({ id }).exec();
}

export async function createTenantWithAccount(
  userData: Record<string, unknown>,
  tenantData: Record<string, unknown>,
  roomId?: string
) {
  return inTransaction(async (session) => {
    const [user] = await User.create([userData], { session });
    const [tenant] = await Tenant.create([tenantData], { session });
    if (roomId) {
      const assigned = await assignWithinSession(
        tenant.id,
        roomId,
        String(tenantData.boardingHouseId),
        session
      );
      return { user, tenant: assigned.tenant };
    }
    return { user, tenant };
  });
}
