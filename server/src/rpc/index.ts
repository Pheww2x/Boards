import { createServer, type Server as HttpServer } from 'http';
import type { Express, Request, Response } from 'express';
import { assignTenantToRoom, getRoomById, state } from '../services/store';

export function createHttpServer(app: Express): HttpServer {
  return createServer(app);
}

export function handleJsonRpc(req: Request, res: Response) {
  const body = req.body ?? {};
  const { jsonrpc, method, params, id } = body;

  if (jsonrpc !== '2.0') {
    return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid JSON-RPC version' } });
  }

  const handlers: Record<string, (params: any) => any> = {
    getRoomAvailability: (input) => {
      const room = getRoomById(input?.roomId);
      if (!room) throw new Error('Room not found');
      return { roomId: room.id, available: room.maxCapacity - room.occupancy, occupancy: room.occupancy };
    },
    createRoom: (input) => {
      const room = {
        id: `room-rpc-${Date.now()}`,
        boardingHouseId: input.boardingHouseId ?? state.boardingHouses[0]?.id ?? 'boarding-house-1',
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
      };
      state.rooms.push(room);
      return room;
    },
    assignTenantToRoom: (input) => {
      const { tenantId, roomId, boardingHouseId } = input ?? {};
      if (!tenantId || !roomId || !boardingHouseId) throw new Error('Missing tenantId, roomId, or boardingHouseId');
      return assignTenantToRoom(tenantId, roomId, boardingHouseId);
    },
    reserveRoom: (input) => {
      const reservation = {
        id: `reservation-${Date.now()}`,
        roomId: input.roomId,
        tenantId: input.tenantId,
        boardingHouseId: input.boardingHouseId,
        checkInDate: input.checkInDate,
        checkOutDate: input.checkOutDate,
        deposit: Number(input.deposit ?? 0),
        status: 'confirmed' as const,
        createdAt: new Date().toISOString(),
      };
      state.reservations.push(reservation);
      return reservation;
    },
    recordPayment: (input) => {
      const payment = {
        id: `payment-rpc-${Date.now()}`,
        tenantId: input.tenantId,
        roomId: input.roomId,
        boardingHouseId: input.boardingHouseId,
        amount: Number(input.amount ?? 0),
        method: input.method ?? 'cash',
        status: 'confirmed' as const,
        createdAt: new Date().toISOString(),
      };
      state.payments.push(payment);
      return payment;
    },
    getTenantInformation: (input) => {
      const tenant = state.tenants.find((item) => item.id === input?.tenantId);
      if (!tenant) throw new Error('Tenant not found');
      return tenant;
    },
  };

  if (!method || typeof method !== 'string' || !handlers[method]) {
    return res.status(404).json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
  }

  try {
    const result = handlers[method](params ?? {});
    return res.json({ jsonrpc: '2.0', id, result });
  } catch (error) {
    return res.status(400).json({ jsonrpc: '2.0', id, error: { code: -32000, message: (error as Error).message } });
  }
}
