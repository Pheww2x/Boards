import mongoose, { Schema, type Document } from 'mongoose';
import { configureApiSerialization } from './schemaOptions';

export type MaintenanceStatus = 'submitted' | 'in_progress' | 'completed';

export interface IMaintenanceRequest extends Document {
  id: string;
  tenantId: string;
  boardingHouseId: string;
  roomId?: string;
  title: string;
  description: string;
  status: MaintenanceStatus;
  createdAt: string;
}

const maintenanceRequestSchema = new Schema<IMaintenanceRequest>({
  id: { type: String, required: true, unique: true },
  tenantId: { type: String, required: true, index: true },
  boardingHouseId: { type: String, required: true, index: true },
  roomId: { type: String },
  title: { type: String, required: true },
  description: { type: String, required: true },
  status: { type: String, enum: ['submitted', 'in_progress', 'completed'], required: true },
  createdAt: { type: String, required: true },
});

configureApiSerialization(maintenanceRequestSchema);

const MaintenanceRequest = mongoose.model<IMaintenanceRequest>(
  'MaintenanceRequest',
  maintenanceRequestSchema,
  'maintenancerequests'
);

export default MaintenanceRequest;
