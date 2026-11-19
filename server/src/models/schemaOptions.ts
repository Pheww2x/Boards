import type { Schema } from 'mongoose';

export function configureApiSerialization(schema: Schema) {
  schema.set('toJSON', {
    virtuals: false,
    transform: (_document, value) => {
      const { _id, __v, ...apiValue } = value;
      return apiValue;
    },
  });
}
