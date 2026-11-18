# LAN Configuration Guide

## Server host configuration

The backend is configured to listen on 0.0.0.0 so Android devices and other clients can reach it over the local hotspot.

Example:

- Laptop IP on hotspot: 192.168.43.120
- Backend: http://192.168.43.120:5000
- Frontend: http://192.168.43.120:5173

Use the actual hotspot IP from the laptop's Wi-Fi adapter. The Android clients must not use localhost or 127.0.0.1 for backend URLs.

## Frontend environment example

The frontend now derives the API and Socket.IO host from the page URL. For example, when a phone opens `http://192.168.43.120:5173`, it automatically connects to `http://192.168.43.120:5000`. No IP needs to be hardcoded when the hotspot address changes.

Optional overrides can be set in `client/.env.local`:

VITE_API_URL=http://192.168.43.120:5000/api
VITE_SOCKET_URL=http://192.168.43.120:5000

Restart Vite after changing these values.

## Mobile hotspot setup

1. Turn on Mobile Hotspot on the Windows laptop or phone.
2. Connect the Android devices to that same hotspot.
3. Confirm the laptop's IP using ipconfig.
4. Start the backend and frontend.
5. On each phone, open `http://<laptop-hotspot-IP>:5173` (not `localhost`).
6. Verify connectivity by opening `http://<laptop-hotspot-IP>:5000/health` on a phone.
7. Log in using one of the demo accounts listed in the project README.

## Firewall note

The application uses port 5000 for the API and 5173 for the Vite frontend in development. If the phone cannot load the health check or frontend, allow inbound TCP connections to these ports on the laptop's Private network in Windows Defender Firewall. Both devices must be connected to the same hotspot, and the laptop's server processes must remain running.
