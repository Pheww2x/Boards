# Testing Documentation

## Local validation performed

- Build verification for the React client
- Build verification for the Express server
- Health check validation of the API service

## Recommended physical demonstration flow

1. Start the backend on the laptop.
2. Connect 3 Android clients to the hotspot.
3. Open the frontend on each device.
4. Log in with different user roles.
5. Create a boarding house and room.
6. Register a tenant and assign them to a room.
7. Record a payment and observe real-time updates.
8. Test room occupancy and disconnection handling.

## Pass criteria

- All devices connect to the same hotspot.
- Role-specific dashboards load correctly.
- Server remains operational if one client disconnects.
- Every client sees updates through the shared network service.
