import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import UserModel from '../models/User';

export type Role = 'super_admin' | 'owner' | 'staff' | 'tenant';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  boardingHouseId?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  boardingHouseId?: string;
  createdAt: string;
}

export interface BoardingHouse {
  id: string;
  name: string;
  owner: string;
  contact: string;
  address: string;
  coordinates: { lat: number; lng: number };
  floors: number;
  totalRooms: number;
  status: 'operational' | 'maintenance' | 'closed';
  createdAt: string;
}

export interface Room {
  id: string;
  boardingHouseId: string;
  roomNumber: string;
  floor: number;
  type: 'single' | 'double' | 'suite' | 'shared';
  maxCapacity: number;
  occupancy: number;
  monthlyRent: number;
  facilities: string[];
  description: string;
  status: 'available' | 'occupied' | 'partially_occupied' | 'reserved' | 'maintenance';
  createdAt: string;
}

export interface Tenant {
  id: string;
  userId?: string;
  name: string;
  email: string;
  phone: string;
  boardingHouseId: string;
  roomId?: string;
  status: 'active' | 'reserved' | 'checked_out' | 'inactive';
  createdAt: string;
}

export interface Reservation {
  id: string;
  roomId: string;
  tenantId: string;
  boardingHouseId: string;
  checkInDate: string;
  checkOutDate: string;
  deposit: number;
  status: 'pending' | 'confirmed' | 'cancelled';
  createdAt: string;
}

export interface Payment {
  id: string;
  tenantId: string;
  roomId: string;
  boardingHouseId: string;
  amount: number;
  method: 'cash' | 'gcash' | 'bank_transfer' | 'other';
  status: 'pending' | 'confirmed' | 'rejected';
  createdAt: string;
}

export interface MaintenanceRequest {
  id: string;
  tenantId: string;
  boardingHouseId: string;
  roomId?: string;
  title: string;
  description: string;
  status: 'submitted' | 'in_progress' | 'completed';
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  createdAt: string;
}

export interface EventLog {
  id: string;
  eventId: string;
  eventType: string;
  entityId?: string;
  boardingHouseId?: string;
  sequence: number;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  action: string;
  actorId: string;
  details: string;
  createdAt: string;
}

export interface AppState {
  users: User[];
  boardingHouses: BoardingHouse[];
  rooms: Room[];
  tenants: Tenant[];
  reservations: Reservation[];
  payments: Payment[];
  maintenanceRequests: MaintenanceRequest[];
  notifications: Notification[];
  announcements: { id: string; message: string; createdAt: string }[];
  eventLogs: EventLog[];
  auditLogs: AuditLog[];
  roomAssignments?: {
    id: string;
    tenantId: string;
    roomId: string;
    boardingHouseId: string;
    assignedAt: string;
    endedAt?: string;
    endReason?: 'transfer' | 'check_out';
  }[];
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function hashPassword(password: string) {
  return bcrypt.hashSync(password, 10);
}

export function comparePassword(password: string, hash: string) {
  return bcrypt.compareSync(password, hash);
}

export function generateToken(user: AuthUser) {
  return jwt.sign(user, env.jwtSecret, { expiresIn: '8h' });
}

export function verifyToken(token: string) {
  return jwt.verify(token, env.jwtSecret) as AuthUser;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid token' });
  }

  let payload: AuthUser;
  try {
    const token = authHeader.replace('Bearer ', '');
    payload = verifyToken(token) as AuthUser;
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  UserModel.findOne({ id: payload.id }).exec().then((user) => {
    if (!user) {
      res.status(401).json({ message: 'User not found' });
      return;
    }
    req.user = {
      ...payload,
      id: user.id,
      email: user.email,
      role: user.role,
      boardingHouseId: user.boardingHouseId,
    };
    next();
  }).catch(next);
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as AuthUser | undefined;
    if (!user) {
      return res.status(401).json({ message: 'Unauthenticated' });
    }
    if (!roles.includes(user.role)) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    next();
  };
}
