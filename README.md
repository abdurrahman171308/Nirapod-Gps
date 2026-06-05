# GPS Tracker Backend

Production-ready GPS tracking backend using NestJS, TypeScript, and MongoDB for Concox GT06N trackers.

## Features

- GT06 protocol support for login, heartbeat, location, and alarm packets
- JWT authentication with access and refresh token flow
- Live tracking over HTTP using `GET /api/v1/tracking/live`
- Historical tracking, trips, and stops APIs
- Alerting for device alarms and overspeed conditions
- TCP ingest server for GPS devices

## Important Note About Live Tracking

This backend does not expose a WebSocket namespace.

If a client tries to connect to `ws://<host>/live`, it will fail with errors such as `WebSocket Connection Failed` or code `1006`.

Use the REST tracking endpoints instead:

- `GET /api/v1/tracking/live`
- `GET /api/v1/tracking/history`
- `GET /api/v1/tracking/trips`
- `GET /api/v1/tracking/stops`

The admin panel should refresh these endpoints with polling, not WebSocket.

## Tech Stack

- NestJS 10
- MongoDB + Mongoose
- Passport + JWT
- Swagger / OpenAPI
- Helmet, CORS, throttling

## Quick Start

### 1. Prerequisites

- Node.js 18+
- MongoDB local instance or MongoDB Atlas
- npm or yarn

### 2. Installation

```bash
cd gps-tracker-backend
npm install
cp .env.example .env
```

### 3. Environment

Edit `.env`:

```env
# MongoDB local
MONGODB_URI=mongodb://localhost:27017/gps-tracker

# MongoDB Atlas example
# MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>/<database>?retryWrites=true&w=majority

JWT_ACCESS_SECRET=your-super-secret-access-key
JWT_REFRESH_SECRET=your-super-secret-refresh-key
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d

ADMIN_EMAIL=admin@gps-tracker.com
ADMIN_PASSWORD=Admin@123456
ADMIN_USERNAME=admin
ADMIN_PHONE=+8801712345678

TCP_PORT=5023
PORT=3000
```

### 4. Run

```bash
# Development
npm run start:dev

# Production build
npm run build
npm run start:prod
```

`npm run build` now cleans `dist/` first so removed modules do not remain in production output.

## Access Points

- API: `http://localhost:3000/api/v1`
- Swagger Docs: `http://localhost:3000/api/docs`
- TCP Server: port `5023`

## Live Tracking Examples

### Current Device State

```bash
curl "http://localhost:3000/api/v1/tracking/live?imei=123456789012345" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Location History

```bash
curl "http://localhost:3000/api/v1/tracking/history?imei=123456789012345&from=2024-01-01T00:00:00Z&to=2024-01-31T23:59:59Z" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### JavaScript Example

```javascript
const response = await fetch(
  'http://localhost:3000/api/v1/tracking/live?imei=123456789012345',
  {
    headers: {
      Authorization: 'Bearer YOUR_ACCESS_TOKEN',
    },
  },
);

const data = await response.json();
console.log(data);
```

## GPS Device Configuration

Configure your Concox GT06N device:

1. APN settings for your SIM card
2. Server address pointing to your server IP or domain
3. Port `5023` or your configured `TCP_PORT`
4. Upload interval around 10 to 30 seconds

## Project Structure

```text
src/
|-- common/
|   |-- decorators/
|   |-- enums/
|   |-- filters/
|   |-- guards/
|   |-- interceptors/
|   |-- types/
|   `-- utils/
|-- database/
|   `-- schemas/
|-- modules/
|   |-- auth/
|   |-- users/
|   |-- devices/
|   |-- locations/
|   |-- alerts/
|   |-- gps-ingest/
|   `-- tracking/
|-- app.module.ts
`-- main.ts
```

## Security Notes

1. Change JWT secrets in production.
2. Restrict `CORS_ORIGINS` in production.
3. Use HTTPS in production.
4. Restrict inbound access to the TCP port where possible.

## License

MIT
