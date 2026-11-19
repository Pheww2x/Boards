
import mongoose, { Schema, Document } from 'mongoose';
import { configureApiSerialization } from './schemaOptions';

export type UserRole = 'super_admin' | 'owner' | 'staff' | 'tenant';

export interface IUser extends Document {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  boardingHouseId?: string;
  createdAt: string;
}

const userSchema = new Schema<IUser>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['super_admin', 'owner', 'staff', 'tenant'],
      required: true,
    },
    boardingHouseId: {
      type: String,
      required: false,
    },
    createdAt: {
      type: String,
      default: () => new Date().toISOString(),
    },
  },
  {
    versionKey: false,
  }
);

configureApiSerialization(userSchema);

const User = mongoose.model<IUser>('User', userSchema, 'users');

export default User;
