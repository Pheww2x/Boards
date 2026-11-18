import { hashPassword, type AppState, type Notification, type EventLog, type Room } from '../middleware/auth';

export const state: AppState = {
  users: [],
  boardingHouses: [],
  rooms: [],
  tenants: [],
  reservations: [],
  payments: [],
  maintenanceRequests: [],
  notifications: [],
  announcements: [],
  eventLogs: [],
  auditLogs: [],
  roomAssignments: [],
};

export function getUserByEmail(email: string) {
  return state.users.find((user) => user.email.toLowerCase() === email.toLowerCase());
}

export function getUserById(id: string) {
  return state.users.find((user) => user.id === id);
}

export function seedDemoData() {
  if (state.users.length > 0) return;

  const adminId = 'user-admin';
  const ownerId = 'user-owner';
  const staffId = 'user-staff';
  const tenantId = 'user-tenant';

  state.users.push(
    {
      id: adminId,
      name: 'System Admin',
      email: 'admin@boardhouse.local',
      passwordHash: hashPassword('admin123'),
      role: 'super_admin',
      createdAt: new Date().toISOString(),
    },
    {
      id: ownerId,
      name: 'Owner Manager',
      email: 'owner@boardhouse.local',
      passwordHash: hashPassword('owner123'),
      role: 'owner',
      boardingHouseId: 'boarding-house-1',
      createdAt: new Date().toISOString(),
    },
    {
      id: staffId,
      name: 'Staff Agent',
      email: 'staff@boardhouse.local',
      passwordHash: hashPassword('staff123'),
      role: 'staff',
      boardingHouseId: 'boarding-house-1',
      createdAt: new Date().toISOString(),
    },
    {
      id: tenantId,
      name: 'Tenant User',
      email: 'tenant@boardhouse.local',
      passwordHash: hashPassword('tenant123'),
      role: 'tenant',
      boardingHouseId: 'boarding-house-1',
      createdAt: new Date().toISOString(),
    }
  );

  const boardingHouseId = 'boarding-house-1';
  state.boardingHouses.push({
    id: boardingHouseId,
    name: 'Sunrise Residency',
    owner: ownerId,
    contact: '+639171234567',
    address: '123 Rizal Street, Davao City',
    coordinates: { lat: 7.1907, lng: 125.4553 },
    floors: 3,
    totalRooms: 12,
    status: 'operational',
    createdAt: new Date().toISOString(),
  });

  state.rooms.push(
    {
      id: 'room-101',
      boardingHouseId,
      roomNumber: '101',
      floor: 1,
      type: 'single',
      maxCapacity: 1,
      occupancy: 0,
      monthlyRent: 5500,
      facilities: ['Aircon', 'Desk'],
      description: 'Single room near lobby',
      status: 'available',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'room-201',
      boardingHouseId,
      roomNumber: '201',
      floor: 2,
      type: 'double',
      maxCapacity: 2,
      occupancy: 1,
      monthlyRent: 7500,
      facilities: ['Aircon', 'Bath'],
      description: 'Double room with veranda',
      status: 'partially_occupied',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'room-301',
      boardingHouseId,
      roomNumber: '301',
      floor: 3,
      type: 'suite',
      maxCapacity: 2,
      occupancy: 2,
      monthlyRent: 9900,
      facilities: ['Aircon', 'Kitchenette'],
      description: 'Premium suite',
      status: 'occupied',
      createdAt: new Date().toISOString(),
    }
  );

  state.tenants.push({
    id: 'tenant-1',
    userId: tenantId,
    name: 'Maria Dela Cruz',
    email: 'maria@example.com',
    phone: '+63999',
    boardingHouseId,
    roomId: 'room-201',
    status: 'active',
    createdAt: new Date().toISOString(),
  });
  state.roomAssignments?.push({
    id: 'assignment-demo-1',
    tenantId: 'tenant-1',
    roomId: 'room-201',
    boardingHouseId,
    assignedAt: new Date().toISOString(),
  });

  state.announcements.push({
    id: 'announcement-1',
    message: 'Monthly dues are due on the 10th.',
    createdAt: new Date().toISOString(),
  });

  state.notifications.push({
    id: 'notification-demo',
    userId: ownerId,
    title: 'Demo system ready',
    message: 'The boarding house dashboard is live.',
    createdAt: new Date().toISOString(),
  });

  state.auditLogs.push({
    id: 'audit-1',
    action: 'seed-demo-data',
    actorId: adminId,
    details: 'Initialized demo boarding house data',
    createdAt: new Date().toISOString(),
  });
}

export function addEventLog(eventType: string, entityId?: string, boardingHouseId?: string) {
  const item: EventLog = {
    id: `event-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    eventId: `${eventType}-${Date.now()}`,
    eventType,
    entityId,
    boardingHouseId,
    sequence: state.eventLogs.length + 1,
    createdAt: new Date().toISOString(),
  };
  state.eventLogs.push(item);
  return item;
}

export function addAuditLog(action: string, actorId: string, details: string) {
  const item = {
    id: `audit-${Date.now()}`,
    action,
    actorId,
    details,
    createdAt: new Date().toISOString(),
  };
  state.auditLogs.push(item);
  return item;
}

export function createNotification(userId: string, title: string, message: string): Notification {
  const item: Notification = {
    id: `notice-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    userId,
    title,
    message,
    createdAt: new Date().toISOString(),
  };
  state.notifications.push(item);
  return item;
}

export function getRoomById(roomId: string) {
  return state.rooms.find((room) => room.id === roomId);
}

export function assignTenantToRoom(tenantId: string, roomId: string, boardingHouseId: string) {
  const room = getRoomById(roomId);
  const tenant = state.tenants.find((item) => item.id === tenantId);
  if (!room || !tenant) {
    throw new Error('Tenant or room not found');
  }
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

  state.roomAssignments = state.roomAssignments ?? [];
  state.roomAssignments.push({
    id: `assignment-${Date.now()}`,
    tenantId,
    roomId,
    boardingHouseId,
    assignedAt: new Date().toISOString(),
  });

  return { room, tenant };
}

function updateRoomOccupancyStatus(room: Room) {
  if (room.status === 'maintenance') return;
  room.status = room.occupancy <= 0
    ? 'available'
    : room.occupancy >= room.maxCapacity
      ? 'occupied'
      : 'partially_occupied';
}

function closeActiveRoomAssignment(tenantId: string, endedAt: string, endReason: 'transfer' | 'check_out') {
  const activeAssignment = [...(state.roomAssignments ?? [])]
    .reverse()
    .find((assignment) => assignment.tenantId === tenantId && !assignment.endedAt);
  if (activeAssignment) {
    activeAssignment.endedAt = endedAt;
    activeAssignment.endReason = endReason;
  }
}

export function transferTenantToRoom(tenantId: string, targetRoomId: string) {
  const tenant = state.tenants.find((item) => item.id === tenantId);
  const targetRoom = getRoomById(targetRoomId);
  const currentRoom = tenant?.roomId ? getRoomById(tenant.roomId) : undefined;
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
  closeActiveRoomAssignment(tenant.id, movedAt, 'transfer');
  tenant.roomId = targetRoom.id;
  state.roomAssignments = state.roomAssignments ?? [];
  state.roomAssignments.push({
    id: `assignment-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    tenantId: tenant.id,
    roomId: targetRoom.id,
    boardingHouseId: tenant.boardingHouseId,
    assignedAt: movedAt,
  });

  return { tenant, fromRoom: currentRoom, toRoom: targetRoom };
}

export function checkOutTenant(tenantId: string) {
  const tenant = state.tenants.find((item) => item.id === tenantId);
  if (!tenant) throw new Error('Tenant not found');
  if (tenant.status === 'checked_out') throw new Error('Tenant is already checked out');

  const room = tenant.roomId ? getRoomById(tenant.roomId) : undefined;
  const checkedOutAt = new Date().toISOString();
  if (room) {
    room.occupancy = Math.max(0, room.occupancy - 1);
    updateRoomOccupancyStatus(room);
    closeActiveRoomAssignment(tenant.id, checkedOutAt, 'check_out');
  }
  tenant.roomId = undefined;
  tenant.status = 'checked_out';

  return { tenant, room, checkedOutAt };
}

export function getRoomsForBoardingHouse(boardingHouseId?: string) {
  if (!boardingHouseId) return state.rooms;
  return state.rooms.filter((room) => room.boardingHouseId === boardingHouseId);
}

export function getDashboardSummary() {
  const totalRooms = state.rooms.length;
  const availableRooms = state.rooms.filter((room) => room.status === 'available').length;
  const occupiedRooms = state.rooms.filter((room) => room.status === 'occupied' || room.status === 'partially_occupied').length;
  const totalTenants = state.tenants.length;
  const totalPayments = state.payments.reduce((sum, payment) => sum + payment.amount, 0);

  return {
    totalRooms,
    availableRooms,
    occupiedRooms,
    totalTenants,
    totalPayments,
  };
}

export function getBoardingHouseById(id: string) {
  return state.boardingHouses.find((house) => house.id === id);
}
