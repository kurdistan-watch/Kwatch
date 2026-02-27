# Kurdistan Air Watch

A production-grade flight tracking dashboard focused on the Kurdistan region. Built with React 18, Vite, and Leaflet.

## Features

- Live aircraft mapping with React Leaflet
- Real-time flight data synchronization
- Military/Civilian aircraft classification
- Responsive side panel for flight details
- Dark mode support

## Tech Stack

- **Framework:** React 18 + Vite
- **Mapping:** React Leaflet + Leaflet.js
- **State Management:** Zustand
- **Styling:** Tailwind CSS
- **Data Fetching:** Axios
- **Linting/Formatting:** ESLint + Prettier

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables:
   ```bash
   cp .env.example .env
   ```
   Fill in your OpenSky Network credentials in `.env`.

### Local Development

Run the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173`.

### Building for Production

```bash
npm run build
```

The production assets will be generated in the `dist` folder.
