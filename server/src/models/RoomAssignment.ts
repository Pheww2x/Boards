import mongoose, { Schema, type Document } from 'mongoose';
import { configureApiSerialization } from './schemaOptions';

export type RoomAssignmentEndReason = 'transfer' | 'check_out';

export interface IRoomAssignment extends Document {
  id: string;
  tenantId: string;
  roomId: string;
  boardingHouseId: string;
  assignedAt: string;
  endedAt?: string;
  endReason?: RoomAssignmentEndReason;
}

const roomAssignmentSchema = new Schema<IRoomAssignment>({
  id: { type: String, required: true, unique: true },
  tenantId: { type: String, required: true, index: true },
  roomId: { type: String, required: true, index: true },
  boardingHouseId: { type: String, required: true, index: true },
  assignedAt: { type: String, required: true },
  endedAt: { type: String },
  endReason: { type: String, enum: ['transfer', 'check_out'] },
});

configureApiSerialization(roomAssignmentSchema);

const RoomAssignment = mongoose.model<IRoomAssignment>('RoomAssignment', roomAssignmentSchema, 'roomassignments');

export default RoomAssignment;
