import mongoose, { Schema, type Document } from 'mongoose';
import { configureApiSerialization } from './schemaOptions';

export interface IAuditLog extends Document {
  id: string;
  action: string;
  actorId: string;
  details: string;
  createdAt: string;
}

const auditLogSchema = new Schema<IAuditLog>({
  id: { type: String, required: true, unique: true },
  action: { type: String, required: true },
  actorId: { type: String, required: true },
  details: { type: String, required: true },
  createdAt: { type: String, required: true },
});

configureApiSerialization(auditLogSchema);

const AuditLog = mongoose.model<IAuditLog>('AuditLog', auditLogSchema, 'auditlogs');

export default AuditLog;
