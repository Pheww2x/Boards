import mongoose, { Schema, type Document } from 'mongoose';
import { configureApiSerialization } from './schemaOptions';

export interface INotification extends Document {
  id: string;
  userId: string;
  title: string;
  message: string;
  createdAt: string;
}

const notificationSchema = new Schema<INotification>({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  createdAt: { type: String, required: true },
});

configureApiSerialization(notificationSchema);

const Notification = mongoose.model<INotification>('Notification', notificationSchema, 'notifications');

export default Notification;
