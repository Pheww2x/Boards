import { createServer, type Server as HttpServer } from 'http';
import type { Express, Request, Response } from 'express';
import { assignTenantToRoom, getRoomById } from '../services/store';
import BoardingHouse from '../models/BoardingHouse';
import Room from '../models/Room';
import Reservation from '../models/Reservation';
import Payment from '../models/Payment';
import Tenant from '../models/Tenant';
import { createId } from '../utils/id';

export function createHttpServer(app: Express): HttpServer {
  return createServer(app);
}

export async function handleJsonRpc(req: Request, res: Response) {
  const body = req.body ?? {};
  const { jsonrpc, method, params, id } = body;

  if (jsonrpc !== '2.0') {
    return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid JSON-RPC version' } });
  }

  const handlers: Record<string, (params: any) => Promise<unknown>> = {
    getRoomAvailability: async (input) => {
      const room = typeof input?.roomId === 'string' ? await getRoomById(input.roomId) : null;
      if (!room) throw new Error('Room not found');
      return { roomId: room.id, available: room.maxCapacity - room.occupancy, occupancy: room.occupancy };
    },
    createRoom: async (input) => {
      const firstBoardingHouse = await BoardingHouse.findOne().exec();
      return Room.create({
        id: createId('room-rpc'),
        boardingHouseId: input.boardingHouseId ?? firstBoardingHouse?.id ?? 'boarding-house-1',
        roomNumber: input.roomNumber ?? '999',
        floor: Number(input.floor ?? 1),
        type: input.type ?? 'single',
        maxCapacity: Number(input.maxCapacity ?? 1),
        occupancy: Number(input.occupancy ?? 0),
        monthlyRent: Number(input.monthlyRent ?? 0),
        facilities: Array.isArray(input.facilities) ? input.facilities : [],
        description: input.description ?? 'RPC room',
        status: input.status ?? 'available',
        createdAt: new Date().toISOString(),
      });
    },
    assignTenantToRoom: async (input) => {
      const { tenantId, roomId, boardingHouseId } = input ?? {};
      if (!tenantId || !roomId || !boardingHouseId) throw new Error('Missing tenantId, roomId, or boardingHouseId');
      return assignTenantToRoom(tenantId, roomId, boardingHouseId);
    },
    reserveRoom: async (input) => {
      return Reservation.create({
        id: createId('reservation'),
        roomId: input.roomId,
        tenantId: input.tenantId,
        boardingHouseId: input.boardingHouseId,
        checkInDate: input.checkInDate,
        checkOutDate: input.checkOutDate,
        deposit: Number(input.deposit ?? 0),
        status: 'confirmed',
        createdAt: new Date().toISOString(),
      });
    },
    recordPayment: async (input) => {
      return Payment.create({
        id: createId('payment-rpc'),
        tenantId: input.tenantId,
        roomId: input.roomId,
        boardingHouseId: input.boardingHouseId,
        amount: Number(input.amount ?? 0),
        method: input.method ?? 'cash',
        status: 'confirmed',
        createdAt: new Date().toISOString(),
      });
    },
    getTenantInformation: async (input) => {
      const tenant = typeof input?.tenantId === 'string'
        ? await Tenant.findOne({ id: input.tenantId }).exec()
        : null;
      if (!tenant) throw new Error('Tenant not found');
      return tenant;
    },
  };

  if (!method || typeof method !== 'string' || !handlers[method]) {
    return res.status(404).json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
  }

  try {
    const result = await handlers[method](params ?? {});
    return res.json({ jsonrpc: '2.0', id, result });
  } catch (error) {
    return res.status(400).json({ jsonrpc: '2.0', id, error: { code: -32000, message: (error as Error).message } });
  }
}
