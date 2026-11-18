import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { state } from '../services/store';

const router = Router();

router.get('/', requireAuth, (req, res) => {
  const user = req.user!;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  if (user.role === 'tenant') {
    const tenant = state.tenants.find((item) => item.userId === user.id);
    if (!tenant) {
      return res.json({
        summary: {
          totalRooms: 0,
          availableRooms: 0,
          occupiedRooms: 0,
          totalTenants: 0,
          totalPayments: 0,
          monthlyIncome: 0,
        },
        tenant: null,
        boardingHouse: null,
        monthlyBalance: 0,
        currentMonthPaid: 0,
        rooms: [],
        tenants: [],
        payments: [],
        maintenanceRequests: [],
        notifications: state.notifications.filter((item) => item.userId === user.id),
        announcements: state.announcements.slice(-10),
      });
    }

    const room = state.rooms.find((item) => item.id === tenant.roomId);
    const payments = state.payments.filter((item) => item.tenantId === tenant.id);
    const currentMonthPaid = payments
      .filter((item) => item.status === 'confirmed' && new Date(item.createdAt) >= monthStart)
      .reduce((sum, item) => sum + item.amount, 0);
    const monthlyBalance = Math.max(0, (room?.monthlyRent ?? 0) - currentMonthPaid);

    return res.json({
      summary: {
        totalRooms: room ? 1 : 0,
        availableRooms: 0,
        occupiedRooms: room ? 1 : 0,
        totalTenants: 1,
        totalPayments: payments
          .filter((item) => item.status === 'confirmed')
          .reduce((sum, item) => sum + item.amount, 0),
        monthlyIncome: currentMonthPaid,
      },
      tenant,
      boardingHouse: state.boardingHouses.find((item) => item.id === tenant.boardingHouseId) ?? null,
      monthlyBalance,
      currentMonthPaid,
      rooms: room ? [room] : [],
      tenants: [tenant],
      payments,
      maintenanceRequests: state.maintenanceRequests.filter((item) => item.tenantId === tenant.id),
      notifications: state.notifications.filter((item) => item.userId === user.id || item.userId === 'all'),
      announcements: state.announcements.slice(-10),
    });
  }

  const boardingHouses = state.boardingHouses.filter((house) => {
    if (user.role === 'super_admin') return true;
    return house.owner === user.id || house.id === user.boardingHouseId;
  });
  const boardingHouseIds = new Set(boardingHouses.map((house) => house.id));
  const rooms = state.rooms.filter((room) => boardingHouseIds.has(room.boardingHouseId));
  const tenants = state.tenants.filter((tenant) => boardingHouseIds.has(tenant.boardingHouseId));
  const tenantIds = new Set(tenants.map((tenant) => tenant.id));
  const payments = state.payments.filter((payment) => tenantIds.has(payment.tenantId));
  const maintenanceRequests = state.maintenanceRequests.filter((item) => boardingHouseIds.has(item.boardingHouseId));
  const notifications = state.notifications.filter((item) => item.userId === user.id || item.userId === 'all');

  return res.json({
    summary: {
      totalRooms: rooms.length,
      availableRooms: rooms.filter((room) => room.status === 'available').length,
      occupiedRooms: rooms.filter((room) => room.status === 'occupied' || room.status === 'partially_occupied').length,
      totalTenants: tenants.length,
      totalPayments: payments
        .filter((payment) => payment.status === 'confirmed')
        .reduce((sum, payment) => sum + payment.amount, 0),
      monthlyIncome: payments
        .filter((payment) => payment.status === 'confirmed' && new Date(payment.createdAt) >= monthStart)
        .reduce((sum, payment) => sum + payment.amount, 0),
    },
    rooms,
    tenants,
    payments,
    maintenanceRequests,
    notifications,
    announcements: state.announcements.slice(-10),
    boardingHouses,
  });
});

export default router;
