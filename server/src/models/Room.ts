import mongoose, { Schema, type Document } from 'mongoose';
import { configureApiSerialization } from './schemaOptions';

export type RoomType = 'single' | 'double' | 'suite' | 'shared';
export type RoomStatus = 'available' | 'occupied' | 'partially_occupied' | 'reserved' | 'maintenance';

export interface IRoom extends Document {
  id: string;
  boardingHouseId: string;
  roomNumber: string;
  floor: number;
  type: RoomType;
  maxCapacity: number;
  occupancy: number;
  monthlyRent: number;
  facilities: string[];
  description: string;
  status: RoomStatus;
  createdAt: string;
}

const roomSchema = new Schema<IRoom>({
  id: { type: String, required: true, unique: true },
  boardingHouseId: { type: String, required: true, index: true },
  roomNumber: { type: String, required: true },
  floor: { type: Number, required: true },
  type: { type: String, enum: ['single', 'double', 'suite', 'shared'], required: true },
  maxCapacity: { type: Number, required: true },
  occupancy: { type: Number, required: true, default: 0 },
  monthlyRent: { type: Number, required: true },
  facilities: { type: [String], default: [] },
  description: { type: String, required: true, default: '' },
  status: {
    type: String,
    enum: ['available', 'occupied', 'partially_occupied', 'reserved', 'maintenance'],
    required: true,
  },
  createdAt: { type: String, required: true },
});

roomSchema.index({ boardingHouseId: 1, roomNumber: 1 }, { unique: true });
configureApiSerialization(roomSchema);

const Room = mongoose.model<IRoom>('Room', roomSchema, 'rooms');

export default Room;
