// Run with mongosh against the application database selected in the connection URI.
const validators = {
  users: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['id', 'name', 'email', 'passwordHash', 'role', 'createdAt'],
      properties: {
        id: { bsonType: 'string' },
        name: { bsonType: 'string' },
        email: { bsonType: 'string' },
        passwordHash: { bsonType: 'string' },
        role: { enum: ['super_admin', 'owner', 'staff', 'tenant'] },
        boardingHouseId: { bsonType: 'string' },
        createdAt: { bsonType: 'string' },
      },
    },
  },
  boardinghouses: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['id', 'name', 'owner', 'contact', 'address', 'coordinates', 'floors', 'totalRooms', 'createdAt'],
      properties: {
        id: { bsonType: 'string' },
        name: { bsonType: 'string' },
        owner: { bsonType: 'string' },
        contact: { bsonType: 'string' },
        address: { bsonType: 'string' },
        coordinates: {
          bsonType: 'object',
          required: ['lat', 'lng'],
          properties: {
            lat: { bsonType: ['double', 'int', 'long', 'decimal'] },
            lng: { bsonType: ['double', 'int', 'long', 'decimal'] },
          },
        },
        floors: { bsonType: ['double', 'int', 'long', 'decimal'], minimum: 1 },
        totalRooms: { bsonType: ['double', 'int', 'long', 'decimal'], minimum: 0 },
        status: { enum: ['operational', 'maintenance', 'closed'] },
        createdAt: { bsonType: 'string' },
      },
    },
  },
  rooms: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['id', 'boardingHouseId', 'roomNumber', 'floor', 'type', 'maxCapacity', 'occupancy', 'monthlyRent', 'status', 'createdAt'],
      properties: {
        id: { bsonType: 'string' },
        boardingHouseId: { bsonType: 'string' },
        roomNumber: { bsonType: 'string' },
        floor: { bsonType: ['double', 'int', 'long', 'decimal'] },
        type: { enum: ['single', 'double', 'suite', 'shared'] },
        maxCapacity: { bsonType: ['double', 'int', 'long', 'decimal'] },
        occupancy: { bsonType: ['double', 'int', 'long', 'decimal'] },
        monthlyRent: { bsonType: ['double', 'int', 'long', 'decimal'] },
        facilities: { bsonType: 'array', items: { bsonType: 'string' } },
        description: { bsonType: 'string' },
        status: { enum: ['available', 'occupied', 'partially_occupied', 'reserved', 'maintenance'] },
        createdAt: { bsonType: 'string' },
      },
    },
  },
  tenants: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['id', 'name', 'email', 'phone', 'boardingHouseId', 'status', 'createdAt'],
      properties: {
        id: { bsonType: 'string' },
        userId: { bsonType: 'string' },
        name: { bsonType: 'string' },
        email: { bsonType: 'string' },
        phone: { bsonType: 'string' },
        boardingHouseId: { bsonType: 'string' },
        roomId: { bsonType: 'string' },
        status: { enum: ['active', 'reserved', 'checked_out', 'inactive'] },
        createdAt: { bsonType: 'string' },
      },
    },
  },
  reservations: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['id', 'roomId', 'tenantId', 'boardingHouseId', 'checkInDate', 'checkOutDate', 'deposit', 'status', 'createdAt'],
      properties: {
        id: { bsonType: 'string' },
        roomId: { bsonType: 'string' },
        tenantId: { bsonType: 'string' },
        boardingHouseId: { bsonType: 'string' },
        checkInDate: { bsonType: 'string' },
        checkOutDate: { bsonType: 'string' },
        deposit: { bsonType: ['double', 'int', 'long', 'decimal'] },
        status: { enum: ['pending', 'confirmed', 'cancelled'] },
        createdAt: { bsonType: 'string' },
      },
    },
  },
  payments: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['id', 'tenantId', 'roomId', 'boardingHouseId', 'amount', 'method', 'status', 'createdAt'],
      properties: {
        id: { bsonType: 'string' },
        tenantId: { bsonType: 'string' },
        roomId: { bsonType: 'string' },
        boardingHouseId: { bsonType: 'string' },
        amount: { bsonType: ['double', 'int', 'long', 'decimal'] },
        method: { enum: ['cash', 'gcash', 'bank_transfer', 'other'] },
        status: { enum: ['pending', 'confirmed', 'rejected'] },
        createdAt: { bsonType: 'string' },
      },
    },
  },
  maintenancerequests: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['id', 'tenantId', 'boardingHouseId', 'title', 'description', 'status', 'createdAt'],
      properties: {
        id: { bsonType: 'string' },
        tenantId: { bsonType: 'string' },
        boardingHouseId: { bsonType: 'string' },
        roomId: { bsonType: 'string' },
        title: { bsonType: 'string' },
        description: { bsonType: 'string' },
        status: { enum: ['submitted', 'in_progress', 'completed'] },
        createdAt: { bsonType: 'string' },
      },
    },
  },
  notifications: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['id', 'userId', 'title', 'message', 'createdAt'],
      properties: {
        id: { bsonType: 'string' },
        userId: { bsonType: 'string' },
        title: { bsonType: 'string' },
        message: { bsonType: 'string' },
        createdAt: { bsonType: 'string' },
      },
    },
  },
  announcements: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['id', 'message', 'createdAt'],
      properties: {
        id: { bsonType: 'string' },
        message: { bsonType: 'string' },
        createdAt: { bsonType: 'string' },
      },
    },
  },
  eventlogs: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['id', 'eventId', 'eventType', 'sequence', 'createdAt'],
      properties: {
        id: { bsonType: 'string' },
        eventId: { bsonType: 'string' },
        eventType: { bsonType: 'string' },
        entityId: { bsonType: 'string' },
        boardingHouseId: { bsonType: 'string' },
        sequence: { bsonType: ['double', 'int', 'long', 'decimal'] },
        createdAt: { bsonType: 'string' },
      },
    },
  },
  auditlogs: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['id', 'action', 'actorId', 'details', 'createdAt'],
      properties: {
        id: { bsonType: 'string' },
        action: { bsonType: 'string' },
        actorId: { bsonType: 'string' },
        details: { bsonType: 'string' },
        createdAt: { bsonType: 'string' },
      },
    },
  },
  roomassignments: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['id', 'tenantId', 'roomId', 'boardingHouseId', 'assignedAt'],
      properties: {
        id: { bsonType: 'string' },
        tenantId: { bsonType: 'string' },
        roomId: { bsonType: 'string' },
        boardingHouseId: { bsonType: 'string' },
        assignedAt: { bsonType: 'string' },
        endedAt: { bsonType: 'string' },
        endReason: { enum: ['transfer', 'check_out'] },
      },
    },
  },
};

const databaseName = db.getName();
if (databaseName === 'admin' || databaseName === 'local' || databaseName === 'config') {
  throw new Error(`Select the Boards application database before applying validators (currently "${databaseName}").`);
}

for (const [collectionName, validator] of Object.entries(validators)) {
  const exists = db.getCollectionInfos({ name: collectionName }).length > 0;
  const options = {
    validator,
    validationLevel: 'moderate',
    validationAction: 'error',
  };
  if (exists) {
    const result = db.runCommand({ collMod: collectionName, ...options });
    if (!result.ok) throw new Error(`Failed to update validator for ${collectionName}: ${tojson(result)}`);
  } else {
    db.createCollection(collectionName, options);
  }
  print(`Applied validator: ${collectionName}`);
}

print(`Validators applied to database "${databaseName}". No documents were inserted, updated, or deleted.`);
