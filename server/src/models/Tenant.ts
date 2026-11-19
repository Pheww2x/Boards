import mongoose, { Schema, type Document } from 'mongoose';
import { configureApiSerialization } from './schemaOptions';

export type TenantStatus = 'active' | 'reserved' | 'checked_out' | 'inactive';

export interface ITenant extends Document {
  id: string;
  userId?: string;
  name: string;
  email: string;
  phone: string;
  boardingHouseId: string;
  roomId?: string;
  status: TenantStatus;
  createdAt: string;
}

const tenantSchema = new Schema<ITenant>(
  {
    id: { type: String, required: true, unique: true },
    userId: { type: String, index: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    boardingHouseId: { type: String, required: true, index: true },
    roomId: { type: String },
    status: { type: String, enum: ['active', 'reserved', 'checked_out', 'inactive'], required: true },
    createdAt: { type: String, required: true },
  },
  { strict: false }
);

configureApiSerialization(tenantSchema);

const Tenant = mongoose.model<ITenant>('Tenant', tenantSchema, 'tenants');

export default Tenant;
