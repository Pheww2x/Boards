import mongoose, { Schema, type Document } from 'mongoose';
import { configureApiSerialization } from './schemaOptions';

export interface IAnnouncement extends Document {
  id: string;
  message: string;
  createdAt: string;
}

const announcementSchema = new Schema<IAnnouncement>({
  id: { type: String, required: true, unique: true },
  message: { type: String, required: true },
  createdAt: { type: String, required: true },
});

configureApiSerialization(announcementSchema);

const Announcement = mongoose.model<IAnnouncement>('Announcement', announcementSchema, 'announcements');

export default Announcement;
