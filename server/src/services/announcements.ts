import Announcement from '../models/Announcement';
import BoardingHouse from '../models/BoardingHouse';
import Tenant from '../models/Tenant';
import type { AuthUser } from '../middleware/auth';

export async function getVisibleAnnouncements(user: AuthUser) {
  let boardingHouseIds: string[] | null = null;

  if (user.role === 'owner') {
    const filter = user.boardingHouseId
      ? { $or: [{ owner: user.id }, { id: user.boardingHouseId }] }
      : { owner: user.id };
    const houses = await BoardingHouse.find(filter).select({ id: 1 }).lean().exec();
    boardingHouseIds = houses.map((house) => house.id);
  } else if (user.role === 'staff') {
    boardingHouseIds = user.boardingHouseId ? [user.boardingHouseId] : [];
  } else if (user.role === 'tenant') {
    const tenant = await Tenant.findOne({ userId: user.id }).select({ boardingHouseId: 1 }).lean().exec();
    boardingHouseIds = tenant ? [tenant.boardingHouseId] : [];
  }

  const query = boardingHouseIds === null
    ? Announcement.find()
    : Announcement.find({
      $or: [
        { boardingHouseId: { $exists: false } },
        { boardingHouseId: null },
        { boardingHouseId: { $in: boardingHouseIds } },
      ],
    });

  const announcements = await query.sort({ createdAt: 1, _id: 1 }).exec();
  return announcements.slice(-10);
}
