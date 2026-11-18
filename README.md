# Boards

This monorepo contains a working demonstration of a distributed boarding-house management platform designed for a local hotspot deployment across one Windows laptop and multiple Android devices.

## Architecture

- Client: React + Vite + TypeScript
- Server: Node.js + Express + TypeScript
- Real-time communication: Socket.IO
- Remote procedure calls: JSON-RPC over HTTP
- In-memory demo data store with MongoDB-ready models and configuration hooks

## Quick start

1. Install dependencies:
   npm install
2. Start the API server:
   npm run dev:server
3. Start the frontend:
   npm run dev:client
4. On an Android phone, open `http://<laptop-hotspot-IP>:5173`. The client automatically uses that host for the API on port 5000 and Socket.IO; do not use `localhost` on the phone.

## Environment variables

Create a .env file in the server folder if you want to override defaults:

PORT=5000
HOST=0.0.0.0
MONGODB_URI=mongodb://127.0.0.1:27017/boarding-house-management
JWT_SECRET=change-this-secret
FRONTEND_URL=http://localhost:5173
SOCKET_ORIGIN=*


## Features implemented

- Role-based authentication
- Role-specific dashboards with private tenant room, payment, and maintenance data
- Room creation, tenant registration with login credentials, and room assignment
- Payment tracking with GCash/bank transfers held pending until staff confirms them
- Tenant maintenance requests and a staff maintenance queue
- Authenticated, boarding-house-scoped Socket.IO updates
- JSON-RPC endpoint at /rpc
- Health endpoint at /health
- LAN-ready host configuration using 0.0.0.0

## Data storage note

The current demonstration data store is in memory. Changes are shared across connected clients while the server is running, but reset when the server restarts. MongoDB connection settings exist, but persistent Mongoose models are not wired into the current routes yet.

## Project structure

- client/ - mobile-friendly React frontend
- server/ - Express + Socket.IO backend
- docs/ - project and LAN documentation

## Demo and validation

The project is designed for a hotspot-based local network demonstration. The server runs on the laptop and clients connect over the same WLAN.

If phone login cannot reach the server, first open `http://<laptop-hotspot-IP>:5000/health` on that phone. Confirm both devices are on the same hotspot, the backend is running, and Windows Firewall allows inbound TCP ports 5000 and 5173 on the Private network. See [docs/LAN-Guide.md](./docs/LAN-Guide.md).
