import mongoose, { Schema, type Document } from 'mongoose';
import { configureApiSerialization } from './schemaOptions';

export type PaymentMethod = 'cash' | 'gcash' | 'bank_transfer' | 'other';
export type PaymentStatus = 'pending' | 'confirmed' | 'rejected';

export interface IPayment extends Document {
  id: string;
  tenantId: string;
  roomId: string;
  boardingHouseId: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  createdAt: string;
}

const paymentSchema = new Schema<IPayment>({
  id: { type: String, required: true, unique: true },
  tenantId: { type: String, required: true, index: true },
  roomId: { type: String, required: true, index: true },
  boardingHouseId: { type: String, required: true, index: true },
  amount: { type: Number, required: true },
  method: { type: String, enum: ['cash', 'gcash', 'bank_transfer', 'other'], required: true },
  status: { type: String, enum: ['pending', 'confirmed', 'rejected'], required: true },
  createdAt: { type: String, required: true },
});

configureApiSerialization(paymentSchema);

const Payment = mongoose.model<IPayment>('Payment', paymentSchema, 'payments');

export default Payment;
