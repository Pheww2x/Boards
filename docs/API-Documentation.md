# API Documentation

## Authentication

- POST /api/auth/login
- GET /api/auth/me

## Boarding houses

- GET /api/boarding-houses
- POST /api/boarding-houses
- GET /api/boarding-houses/:id

## Room management

- GET /api/rooms
- POST /api/rooms
- PATCH /api/rooms/:id
- GET /api/rooms/:id/availability

## Tenant management

- GET /api/tenants
- POST /api/tenants
- GET /api/tenants/:id
- PATCH /api/tenants/:id
- POST /api/tenants/:id/transfer
- POST /api/tenants/:id/checkout

Tenant registration requires a name, login email, and password of at least 8 characters. The password is hashed before it is stored. Staff and owners can optionally assign the tenant to an available room during registration.

Tenant tokens only receive their own tenant profile, assigned room, payment history, and maintenance requests. Owner/staff records are scoped to their assigned boarding house.

## Dashboard and reports

- GET /api/dashboard

## Payments and maintenance

- GET /api/payments
- POST /api/payments
- PATCH /api/payments/:id/confirm
- GET /api/maintenance
- POST /api/maintenance
- PATCH /api/maintenance/:id

GCash and bank-transfer payments start as pending. An authorized staff member or owner must confirm them before they count as collected.

The dashboard endpoint returns a role-scoped payload, including tenant-specific room details, this month's paid amount, and remaining room-rent balance. The client handles request failures with a visible retry state rather than leaving the dashboard in a permanent loading state.

Room transfers validate destination capacity and boarding-house ownership, update both rooms, and append room-assignment history. Check-out releases the room and marks the tenant as checked out; it does not delete the tenant or their payment history.

## JSON-RPC

- POST /rpc

Supported sample methods:

- getRoomAvailability
- createRoom
- assignTenantToRoom
- reserveRoom
- recordPayment
- getTenantInformation

Each request returns a JSON-RPC 2.0 envelope with either a result or an error object.
