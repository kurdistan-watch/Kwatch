# Kurdistan Air Watch ✈️

A production-grade, open-source flight tracking and live news dashboard focused on the **Kurdistan Region of Iraq** and the wider Middle East.

Built with **React 18**, **Vite**, **Leaflet**, and **Vercel Serverless Functions**.

---

## ✨ Features

- 🛩️ **Live aircraft tracking** — real-time flight data via OpenSky Network
- 🗺️ **Interactive Leaflet map** — dark/light tile themes, MENA bounding box
- 🧠 **Military/civilian classifier** — automatic flight type detection
- 🚨 **Alert system** — watchlist country detection + military pattern alerts
- 📰 **Multi-source news** — Rudaw, Kurdistan 24, Al Jazeera, BBC, CNN, DW and more
- ⚡ **Flash/breaking headlines** — 3-minute polling from Rudaw ticker
- 📍 **Geo-pinned news markers** — articles placed on the map by location
- 🌍 **Global news panel** — world-wide coverage with regional geo-tagging
- 🌙 **Dark / light mode** — persisted via localStorage
- 📱 **Responsive layout** — collapses gracefully on narrow screens
- 🔒 **Security headers** — `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` via Vercel

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5 |
| Mapping | React Leaflet 4, Leaflet.js |
| State | Zustand 4 |
| Styling | Tailwind CSS 3 |
| API routes | Vercel Serverless Functions (Node 20) |
| HTTP | Axios, native `fetch` with `AbortController` |
| XML parsing | fast-xml-parser |
| Linting | ESLint + Prettier |
| CI | GitHub Actions |
| Hosting | Vercel |

---

## 📂 Project Structure

```
├── api/                  # Vercel serverless functions (CORS proxies, scrapers)
│   ├── flash.js          # Rudaw "fast news" ticker scraper
│   ├── globalNews.js     # Multi-feed world news aggregator
│   ├── kurdistan24.js    # Kurdistan 24 RSS proxy
│   ├── news.js           # Rudaw JSON API proxy
│   ├── opensky.js        # OpenSky Network OAuth2 proxy
│   └── planespotters.js  # Planespotters photo CORS proxy
├── public/               # Static GeoJSON boundary files
├── src/
│   ├── components/
│   │   ├── map/          # Leaflet map, layers, markers
│   │   ├── panel/        # NewsPanel, SidePanel, FlightCard, FilterBar
│   │   └── ui/           # StatusBar, AlertBadge, ErrorBoundary, LiveTVGrid
│   ├── constants/        # Flight types, region definitions
│   ├── hooks/            # Polling hooks (flights, news, flash, K24, global)
│   ├── services/         # classifier, geoMatcher, geoUtils, opensky client
│   └── store/            # Zustand flight + news store
├── .env.example          # Required environment variable template
├── vercel.json           # Rewrites, security headers, cache rules
└── vite.config.js        # Vite config with path aliases and dev proxies
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v20+
- **npm** v9+
- A free [OpenSky Network](https://opensky-network.org/) account (optional — anonymous access works but is rate-limited)

### 1. Clone and install

```bash
git clone https://github.com/kurdistan-watch/Kwatch.git
cd Kwatch
npm ci
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in your credentials:

```bash
# Optional — without these, OpenSky anonymous rate limits apply (~400 req/day)
OPENSKY_USERNAME=your_username
OPENSKY_PASSWORD=your_password
```

### 3. Run locally with Vercel Dev (recommended)

`vercel dev` runs both the Vite frontend and all `/api/*` serverless functions together on one port — exactly matching the production environment.

```bash
npm install -g vercel   # first time only
vercel dev              # serves on http://localhost:3000
```

### 4. Run with Vite only (frontend only)

If you only need the frontend without API routes:

```bash
npm run dev             # serves on http://localhost:5173
```

> ⚠️ `/api/*` routes won't work without `vercel dev`. The Vite dev proxy in `vite.config.js` handles OpenSky and Planespotters, but `news`, `flash`, and `kurdistan24` require the Vercel runtime.

---

## 🧪 Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server (frontend only) |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint (zero warnings policy) |
| `npm run format` | Auto-format all `src/` files with Prettier |
| `vercel dev` | Full-stack local dev (frontend + API routes) |

---

## 🌿 Branch Structure

| Branch | Purpose | Deployment |
|---|---|---|
| `main` | Production | Custom domain via Vercel |
| `staging` | Pre-production QA | Vercel preview URL |
| `dev` | Feature integration | Vercel preview URL |

**Workflow:**
```
feature/* → dev → staging → main
```

- Open a PR from `feature/*` into `dev`
- CI (GitHub Actions) runs lint + build on every PR
- Merge to `staging` for final smoke test on the preview URL
- Merge to `main` to deploy to production

---

## 🔑 Environment Variables

| Variable | Required | Description |
|---|---|---|
| `OPENSKY_USERNAME` | No | OpenSky Network username for authenticated API access |
| `OPENSKY_PASSWORD` | No | OpenSky Network password |

See [`.env.example`](.env.example) for the full template.

> **Never commit `.env.local`** — it is listed in `.gitignore`.
> In Vercel: set variables at **Dashboard → Project → Settings → Environment Variables**.

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. **Fork** the repository
2. **Create a feature branch** from `dev`:
   ```bash
   git checkout dev
   git pull origin dev
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes** — keep commits small and focused
4. **Lint and build** before pushing:
   ```bash
   npm run lint
   npm run build
   ```
5. **Open a Pull Request** targeting the `dev` branch
6. A maintainer will review and merge into `dev` → `staging` → `main`

### Code Style

- ESLint + Prettier are enforced — run `npm run format` before committing
- No `console.log` in production code — use `console.info` / `console.warn` / `console.error`
- All polling hooks must include a `visibilitychange` guard and `AbortController` timeout
- Zustand store items must use serialisable values — no `Date` objects, use ISO strings

---

## 📄 License

This project is open-source. See [LICENSE](LICENSE) for details.

---

## 🙏 Data Sources

| Source | Usage |
|---|---|
| [OpenSky Network](https://opensky-network.org/) | Live flight state vectors |
| [Planespotters.net](https://www.planespotters.net/) | Aircraft photos |
| [Rudaw](https://www.rudaw.net/) | Kurdish & Iraqi news + flash headlines |
| [Kurdistan 24](https://www.kurdistan24.net/) | Kurdish news RSS |
| [Al Jazeera](https://www.aljazeera.com/) | World news RSS |
| [BBC World](https://www.bbc.co.uk/news/world) | World news RSS |
| [CNN World](https://edition.cnn.com/world) | World news RSS |
| [DW News](https://www.dw.com/) | World news RSS |
| [CartoCDN](https://carto.com/) | Map tiles (dark & light) |
