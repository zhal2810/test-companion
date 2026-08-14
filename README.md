
# ERA Production Planner

A full-stack web application for managing and analyzing production data, market intelligence, and company operations in the ERA game. Built with React, TypeScript, Express, and Vite.

## Features

- **Market Intelligence**: Real-time market data, price charts, and trading analytics
- **Company Analysis**: Comprehensive company performance metrics and supply chain tracking
- **Production Management**: Production scheduling and resource optimization
- **Order Management**: Order book tracking and transaction ledger
- **News & Events**: Game news feed and significant events tracking
- **Candlestick Charts**: Advanced price visualization with lightweight-charts
- **API Configuration**: Flexible API endpoint configuration with modal interface
- **Multi-language Support**: Global settings panel for localization

## Project Structure

```
era-production-planner/
├── src/                           # React frontend
│   ├── components/               # React components (Dashboard, Charts, Modals, etc.)
│   ├── api/                      # API client utilities
│   ├── utils/                    # Helper functions (signalEngine, priceHelper, etc.)
│   ├── data/                     # Game config and static data
│   ├── App.tsx                   # Main app component
│   └── main.tsx                  # Entry point
├── functions/api/                # Backend API endpoints
│   ├── market/                   # Market data endpoints
│   ├── players/                  # Player data endpoints
│   ├── pulse/                    # Market pulse/history endpoints
│   ├── stats/                    # Statistics endpoints
│   └── warera/                   # Game data endpoints
├── public/                       # Static assets
├── server.ts                     # Express server configuration
├── vite.config.ts               # Vite configuration
├── tsconfig.json                # TypeScript configuration
└── package.json                 # Dependencies and scripts
```

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm** or **yarn**

## Installation & Setup

### 1. Install dependencies:
```bash
npm install
```

### 2. Environment Configuration

Create a `.env` file in the root directory with your API configuration:

```env
VITE_API_BASE_URL=http://localhost:5000
VITE_GAME_API_ENDPOINT=https://api.era-game.com  # External game API
```

The API connections are configured in:
- **Frontend**: [src/api/apiClient.ts](src/api/apiClient.ts) - Main HTTP client
- **Backend Proxy**: [src/utils/proxyHandler.ts](src/utils/proxyHandler.ts) - External API proxy logic

### 3. Run Locally

#### Development Mode (Frontend + Backend)

**Terminal 1 - Backend Server:**
```bash
npm run dev
```
Starts Express server on `http://localhost:5000`

**Terminal 2 - Frontend Dev Server:**
```bash
npm run dev:client
```
Starts Vite dev server on `http://localhost:5173`

#### Frontend Only:
```bash
npm run dev:client
```

## Building & Deployment

### Build for Production:
```bash
npm run build
```
Bundles both client and server for production.

- **Client build**: Outputs to `dist/` (Vite)
- **Server build**: Outputs to `dist/server.cjs` (esbuild)

### Preview Production Build:
```bash
npm run preview
```

### Start Production Server:
```bash
npm start
```
Runs the bundled server from `dist/server.cjs`

### Clean Build Artifacts:
```bash
npm run clean
```

## Type Checking

```bash
npm run lint
```
Runs TypeScript compiler to check for type errors.

## API Endpoints

### Market Data
- `GET /api/market/items` - Get market items
- `GET /api/market/stats` - Get market statistics
- `GET /api/market/pulse-snapshot` - Get market pulse snapshot
- `GET /api/market/offers/[itemCode]` - Get item offers

### Player Data
- `GET /api/players/[procedure]` - Get player information

### Market Pulse/History
- `GET /api/pulse/history/[item]` - Get item price history
- `GET /api/pulse/history/transactions` - Get transaction history

### Statistics
- `GET /api/stats/item/[item]` - Get item statistics

### Warera (Game Data)
- `GET /api/warera/[[path]]` - General warera data endpoints
- `GET /api/warera/[procedure]` - Warera procedures
- `GET /api/warera/order` - Get order information
- `GET /api/warera/orders` - Get orders list

### Health
- `GET /api/health` - Server health check

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, Vite
- **Backend**: Express.js, Node.js
- **Charting**: lightweight-charts, Recharts
- **UI Components**: Lucide React, Motion (animations)
- **HTTP Client**: Axios
- **AI Integration**: Google GenAI
- **Build Tools**: esbuild, TypeScript

## Available Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start backend Express server |
| `npm run dev:client` | Start frontend Vite dev server |
| `npm run build` | Build for production (client + server) |
| `npm run build:client` | Build frontend only |
| `npm run start` | Run production server |
| `npm run preview` | Preview production build |
| `npm run clean` | Remove build artifacts |
| `npm run lint` | Type check with TypeScript |

## Configuration Files

- **vite.config.ts** - Frontend bundler configuration
- **tsconfig.json** - TypeScript compiler options
- **server.ts** - Express server setup and middleware
- **.env** - Environment variables (create this file)

## Common Issues & Solutions

### API Connection Issues
- Check that backend is running on the configured port
- Verify `VITE_API_BASE_URL` in `.env` matches your backend URL
- Check CORS settings in [server.ts](server.ts)

### Build Failures
- Ensure Node.js version is 18+: `node --version`
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`
- Run `npm run lint` to check for TypeScript errors

### HMR Issues in Development
- Set `DISABLE_HMR=true` environment variable if needed for AI Studio environments

## License

See LICENSE file for details.
