import mongoose, { Schema, type Document } from 'mongoose';
import { configureApiSerialization } from './schemaOptions';

export type ReservationStatus = 'pending' | 'confirmed' | 'cancelled';

export interface IReservation extends Document {
  id: string;
  roomId: string;
  tenantId: string;
  boardingHouseId: string;
  checkInDate: string;
  checkOutDate: string;
  deposit: number;
  status: ReservationStatus;
  createdAt: string;
}

const reservationSchema = new Schema<IReservation>({
  id: { type: String, required: true, unique: true },
  roomId: { type: String, required: true, index: true },
  tenantId: { type: String, required: true, index: true },
  boardingHouseId: { type: String, required: true, index: true },
  checkInDate: { type: String, required: true },
  checkOutDate: { type: String, required: true },
  deposit: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'confirmed', 'cancelled'], required: true },
  createdAt: { type: String, required: true },
});

configureApiSerialization(reservationSchema);

const Reservation = mongoose.model<IReservation>('Reservation', reservationSchema, 'reservations');

export default Reservation;
