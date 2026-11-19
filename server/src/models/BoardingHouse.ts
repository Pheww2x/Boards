
import mongoose, { Schema, Document } from 'mongoose';
import { configureApiSerialization } from './schemaOptions';

export type BoardingHouseStatus =
  | 'operational'
  | 'maintenance'
  | 'closed';

export interface IBoardingHouse extends Document {
  id: string;
  name: string;
  owner: string;
  contact: string;
  address: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  floors: number;
  totalRooms: number;
  status: BoardingHouseStatus;
  createdAt: string;
}

const boardingHouseSchema = new Schema<IBoardingHouse>(
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
    owner: {
      type: String,
      required: true,
    },
    contact: {
      type: String,
      required: true,
    },
    address: {
      type: String,
      required: true,
    },
    coordinates: {
      lat: {
        type: Number,
        required: true,
      },
      lng: {
        type: Number,
        required: true,
      },
    },
    floors: {
      type: Number,
      required: true,
      min: 1,
    },
    totalRooms: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['operational', 'maintenance', 'closed'],
      default: 'operational',
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

configureApiSerialization(boardingHouseSchema);

const BoardingHouse = mongoose.model<IBoardingHouse>(
  'BoardingHouse',
  boardingHouseSchema,
  'boardinghouses'
);

export default BoardingHouse;
