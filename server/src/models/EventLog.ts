import mongoose, { Schema, type Document } from 'mongoose';
import { configureApiSerialization } from './schemaOptions';

export interface IEventLog extends Document {
  id: string;
  eventId: string;
  eventType: string;
  entityId?: string;
  boardingHouseId?: string;
  sequence: number;
  createdAt: string;
}

const eventLogSchema = new Schema<IEventLog>({
  id: { type: String, required: true, unique: true },
  eventId: { type: String, required: true },
  eventType: { type: String, required: true },
  entityId: { type: String },
  boardingHouseId: { type: String, index: true },
  sequence: { type: Number, required: true },
  createdAt: { type: String, required: true },
});

configureApiSerialization(eventLogSchema);

const EventLog = mongoose.model<IEventLog>('EventLog', eventLogSchema, 'eventlogs');

export default EventLog;
