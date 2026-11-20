import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import BoardingHouse from '../models/BoardingHouse';
import MaintenanceRequest from '../models/MaintenanceRequest';
import Notification from '../models/Notification';
import Payment from '../models/Payment';
import Room from '../models/Room';
import Tenant from '../models/Tenant';
import { getVisibleAnnouncements } from '../services/announcements';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const user = req.user!;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [allRooms, allTenants, allPayments, allMaintenanceRequests, allBoardingHouses, announcements] = await Promise.all([
    Room.find().exec(),
    Tenant.find().exec(),
    Payment.find().exec(),
    MaintenanceRequest.find().exec(),
    BoardingHouse.find().exec(),
    getVisibleAnnouncements(user),
  ]);

  if (user.role === 'tenant') {
    const tenant = allTenants.find((item) => item.userId === user.id);
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
        notifications: await Notification.find({ userId: user.id }).exec(),
        announcements,
      });
    }

    const room = allRooms.find((item) => item.id === tenant.roomId);
    const payments = allPayments.filter((item) => item.tenantId === tenant.id);
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
      boardingHouse: allBoardingHouses.find((item) => item.id === tenant.boardingHouseId) ?? null,
      monthlyBalance,
      currentMonthPaid,
      rooms: room ? [room] : [],
      tenants: [tenant],
      payments,
      maintenanceRequests: allMaintenanceRequests.filter((item) => item.tenantId === tenant.id),
      notifications: await Notification.find({ userId: { $in: [user.id, 'all'] } }).exec(),
      announcements,
    });
  }

  const boardingHouses = allBoardingHouses.filter((house) => {
    if (user.role === 'super_admin') return true;
    return house.owner === user.id || house.id === user.boardingHouseId;
  });
  const boardingHouseIds = new Set(boardingHouses.map((house) => house.id));
  const rooms = allRooms.filter((room) => boardingHouseIds.has(room.boardingHouseId));
  const tenants = allTenants.filter((tenant) => boardingHouseIds.has(tenant.boardingHouseId));
  const tenantIds = new Set(tenants.map((tenant) => tenant.id));
  const payments = allPayments.filter((payment) => tenantIds.has(payment.tenantId));
  const maintenanceRequests = allMaintenanceRequests.filter((item) => boardingHouseIds.has(item.boardingHouseId));
  const notifications = await Notification.find({ userId: { $in: [user.id, 'all'] } }).exec();

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
    announcements,
    boardingHouses,
  });
}));

export default router;
