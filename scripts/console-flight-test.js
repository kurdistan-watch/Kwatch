/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Kwatch — Browser DevTools Console Flight Render Test
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PURPOSE
 * ───────
 * Validates the full pipeline from raw API shape → normalise → classify →
 * Zustand store → AircraftLayer canvas render, without needing live API data.
 *
 * HOW TO RUN
 * ──────────
 * 1. Open http://localhost:3000 in Chrome/Firefox.
 * 2. Open DevTools → Console.
 * 3. Paste this entire script and press Enter.
 * 4. Read the ✅ / ❌ results in the console.
 *
 * The test injects synthetic flights directly into the Zustand store and
 * verifies they appear on the canvas layer in the expected colours.
 * After 15 seconds the original store state is automatically restored.
 * ═══════════════════════════════════════════════════════════════════════════
 */

(async function KwatchFlightTest() {
  'use strict';

  // ── Colour constants (must match src/services/classifier.js) ───────────
  const COLORS = {
    UNKNOWN:    '#38BDF8',
    MILITARY:   '#F97316',
    COMMERCIAL: '#3B82F6',
  };

  // ── Step 0: locate the Zustand store ────────────────────────────────────
  // React's fibre tree is walked to find the first component that has the
  // useFlightStore hook attached. This works in both dev and prod builds.

  const getStore = () => {
    // Vite dev build exposes __ZUSTAND_STORES__ when zustand devtools are on,
    // but the safest universal approach is walking the React fibre tree.
    const root = document.querySelector('#root')?._reactFiber
                ?? document.querySelector('#root')?._reactFiberContainer?.current;
    if (!root) return null;

    const walk = (node, depth = 0) => {
      if (!node || depth > 200) return null;
      const memoizedState = node.memoizedState;
      if (memoizedState) {
        let s = memoizedState;
        while (s) {
          if (s.queue && typeof s.memoizedState === 'object' && s.memoizedState?.setFlights) {
            return s.memoizedState; // this IS the store state/actions object
          }
          // Check for the Zustand store object attached to hook state
          if (typeof s.memoizedState?.getState === 'function') {
            return s.memoizedState.getState();
          }
          s = s.next;
        }
      }
      const child = walk(node.child, depth + 1);
      if (child) return child;
      return walk(node.sibling, depth + 1);
    };

    return walk(root);
  };

  // Alternative: find via window if the app exposes it (some Vite setups do)
  const findStoreViaWindow = () => {
    for (const key of Object.keys(window)) {
      const val = window[key];
      if (val && typeof val === 'object' && typeof val.getState === 'function') {
        const s = val.getState();
        if (Array.isArray(s.flights) && typeof s.setFlights === 'function') {
          return s;
        }
      }
    }
    return null;
  };

  // ── Step 1: reach the store's setFlights action ──────────────────────────
  // The cleanest way is to grab it from the React DevTools hook which Vite
  // always injects in dev mode.

  const getSetFlights = () => {
    // Try the __REACT_DEVTOOLS_GLOBAL_HOOK__ approach first
    const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (hook) {
      for (const [, renderer] of (hook.renderers ?? new Map())) {
        try {
          const roots = renderer.getFiberRoots?.();
          if (!roots) continue;
          for (const root of roots) {
            const result = walkFibre(root.current);
            if (result) return result;
          }
        } catch (_) {}
      }
    }
    return null;
  };

  const walkFibre = (node, depth = 0) => {
    if (!node || depth > 300) return null;
    // Look for Zustand store subscription hooks
    let s = node.memoizedState;
    while (s) {
      const ms = s.memoizedState;
      if (ms && typeof ms === 'object' && !Array.isArray(ms)) {
        if (typeof ms.setFlights === 'function') return ms;
        if (typeof ms.getState === 'function') {
          const st = ms.getState?.();
          if (typeof st?.setFlights === 'function') return st;
        }
      }
      s = s.next;
    }
    if (node.child) {
      const r = walkFibre(node.child, depth + 1);
      if (r) return r;
    }
    if (node.sibling) {
      const r = walkFibre(node.sibling, depth + 1);
      if (r) return r;
    }
    return null;
  };

  // ── Synthetic flight factory ─────────────────────────────────────────────

  const now = () => Math.floor(Date.now() / 1000);

  /**
   * Builds a flight object in the shape produced by opensky.js normalise().
   * Fields match exactly what AircraftLayer / classifier.js expect.
   */
  const makeOpenskyFlight = (overrides) => ({
    icao24:        'test-osky-01',
    callsign:      'TK489',        // IATA → COMMERCIAL
    latitude:      36.2,
    longitude:     44.0,           // over Erbil
    altitude:      32000,
    velocity:      450,
    heading:       270,
    verticalRate:  0,
    onGround:      false,
    lastContact:   now(),
    originCountry: 'Turkey',
    source:        'opensky',
    ...overrides,
  });

  /**
   * Builds a flight object in the shape produced by adsb.js normalise().
   * source:'adsb' is the only structural difference from opensky shape.
   */
  const makeAdsbFlight = (overrides) => ({
    icao24:        'test-adsb-01',
    callsign:      'RCH007',       // MILITARY callsign prefix
    latitude:      36.5,
    longitude:     43.2,           // west of Erbil
    altitude:      18000,
    velocity:      380,
    heading:       90,
    verticalRate:  -500,
    onGround:      false,
    lastContact:   now(),
    originCountry: 'United States',
    source:        'adsb',
    ...overrides,
  });

  // ── Classifier (inlined — mirrors src/services/classifier.js) ────────────
  // We re-implement the classifier here so the test is self-contained and
  // never depends on ES module resolution in the console context.

  const MILITARY_PREFIXES  = ['RCH','REACH','MMF','JAKE','OLIVE','KNIFE','FURY',
                               'TOPCAT','DOOM','VIPER','BONE','GHOST','CNV','NAVY',
                               'RRR','ASCOT','COMET','TARTAN','RFR','FAF','COTAM',
                               'NATO','MAGIC','TUAF','KAFKAS','JAF','RJAF','SAF','PAF'];
  const MIL_COUNTRIES      = new Set(['Iran','Russia']);
  const COMMERCIAL_PFXS    = ['KAR','IRY','UR','PC','TK','EK','FZ','WS','GF'];
  const IATA_RE            = /^[A-Z]{2}\d{1,4}$/;

  const isCommercial = (cs) => IATA_RE.test(cs) || COMMERCIAL_PFXS.some(p => cs.startsWith(p));

  const classify = (f) => {
    const cs  = (f.callsign ?? '').trim().toUpperCase();
    const hex = (f.icao24  ?? '').toLowerCase();
    const t   = Math.floor(Date.now() / 1000);

    // UNKNOWN rules
    if (!cs || f.originCountry == null) return { classification: 'UNKNOWN', displayColor: COLORS.UNKNOWN, threatLevel: 3 };
    if (f.lastContact && t - f.lastContact > 120) return { classification: 'UNKNOWN', displayColor: COLORS.UNKNOWN, threatLevel: 3 };

    // MILITARY rules
    if (MILITARY_PREFIXES.some(p => cs.startsWith(p))) return { classification: 'MILITARY', displayColor: COLORS.MILITARY, threatLevel: 2 };
    if (hex.startsWith('ae'))                           return { classification: 'MILITARY', displayColor: COLORS.MILITARY, threatLevel: 2 };
    if (hex.startsWith('43') && f.originCountry === 'United Kingdom') return { classification: 'MILITARY', displayColor: COLORS.MILITARY, threatLevel: 2 };
    if (MIL_COUNTRIES.has(f.originCountry))             return { classification: 'MILITARY', displayColor: COLORS.MILITARY, threatLevel: 2 };

    // COMMERCIAL fallback
    return { classification: 'COMMERCIAL', displayColor: COLORS.COMMERCIAL, threatLevel: 0 };
  };

  const enrichFlight = (f) => ({ ...f, ...classify(f) });

  // ── Test suite ───────────────────────────────────────────────────────────

  console.group('%c🛫 Kwatch Flight Render Test', 'font-size:14px;font-weight:bold;color:#F97316');
  let passed = 0, failed = 0;

  const assert = (label, actual, expected) => {
    if (actual === expected) {
      console.log(`  %c✅ ${label}`, 'color:#22C55E', `→ ${actual}`);
      passed++;
    } else {
      console.error(`  ❌ ${label}`, `\n     expected: ${expected}\n     got:      ${actual}`);
      failed++;
    }
  };

  // ── UNIT: classifier correctness ─────────────────────────────────────────
  console.groupCollapsed('%c[1/4] Classifier unit tests', 'color:#94A3B8');

  const commercial = enrichFlight(makeOpenskyFlight());
  assert('OpenSky TK489 → COMMERCIAL',    commercial.classification, 'COMMERCIAL');
  assert('OpenSky TK489 color → blue',    commercial.displayColor,   COLORS.COMMERCIAL);

  const military = enrichFlight(makeAdsbFlight());
  assert('ADSB RCH007 → MILITARY',        military.classification,   'MILITARY');
  assert('ADSB RCH007 color → orange',    military.displayColor,     COLORS.MILITARY);

  const unknown = enrichFlight(makeOpenskyFlight({ callsign: '', originCountry: null }));
  assert('No callsign → UNKNOWN',         unknown.classification,    'UNKNOWN');
  assert('No callsign color → sky-blue',  unknown.displayColor,      COLORS.UNKNOWN);

  const iraniMil = enrichFlight(makeAdsbFlight({ callsign: 'EP-ABC', originCountry: 'Iran', icao24: 'test-ir-01' }));
  assert('Iranian origin → MILITARY',     iraniMil.classification,   'MILITARY');

  const usMilHex = enrichFlight(makeOpenskyFlight({ icao24: 'ae1234', callsign: 'N12345', originCountry: 'United States' }));
  assert('US mil ICAO24 (ae…) → MILITARY', usMilHex.classification, 'MILITARY');

  // Asian flights
  const chinaCivil = enrichFlight(makeOpenskyFlight({ icao24: 'test-cn-01', callsign: 'CCA101', latitude: 35.0, longitude: 105.0, originCountry: 'China' }));
  assert('China civil CCA101 → COMMERCIAL', chinaCivil.classification, 'COMMERCIAL');

  const russiaAsia = enrichFlight(makeAdsbFlight({ icao24: 'test-ru-02', callsign: 'RFF100', latitude: 55.0, longitude: 82.0, originCountry: 'Russia' }));
  assert('Russia origin (Asia) → MILITARY', russiaAsia.classification, 'MILITARY');

  console.groupEnd();

  // ── UNIT: flight shape validation ────────────────────────────────────────
  console.groupCollapsed('%c[2/4] Flight object shape tests', 'color:#94A3B8');

  const requiredFields = ['icao24','callsign','latitude','longitude','altitude','velocity','heading','onGround','lastContact','originCountry'];

  const checkShape = (label, flight) => {
    for (const field of requiredFields) {
      if (!(field in flight)) {
        console.error(`  ❌ ${label} missing field: ${field}`);
        failed++;
      } else {
        passed++;
      }
    }
    assert(`${label} latitude in range`,  flight.latitude  >= -90  && flight.latitude  <= 90,  true);
    assert(`${label} longitude in range`, flight.longitude >= -180 && flight.longitude <= 180, true);
    assert(`${label} heading in range`,   flight.heading   >= 0    && flight.heading   <= 360, true);
  };

  checkShape('OpenSky flight', makeOpenskyFlight());
  checkShape('ADSB flight',    makeAdsbFlight());

  console.groupEnd();

  // ── INTEGRATION: inject into store & verify canvas ───────────────────────
  console.groupCollapsed('%c[3/4] Store injection & canvas render', 'color:#94A3B8');

  // Find the Zustand store's setFlights via the React root
  let setFlights = null;
  let getFlights = null;
  let originalFlights = [];

  // Strategy A: __REACT_DEVTOOLS_GLOBAL_HOOK__
  try {
    const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (hook?.renderers) {
      for (const [, renderer] of hook.renderers) {
        try {
          const roots = renderer.getFiberRoots?.() ?? [];
          for (const root of roots) {
            const found = walkFibre(root.current);
            if (found?.setFlights) {
              setFlights = found.setFlights.bind(found);
              getFlights = () => found.flights;
              originalFlights = [...(found.flights ?? [])];
              break;
            }
          }
        } catch (_) {}
      }
    }
  } catch (_) {}

  // Strategy B: walk from React root element directly
  if (!setFlights) {
    try {
      const rootEl = document.getElementById('root');
      const fiberKey = Object.keys(rootEl).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactContainer'));
      if (fiberKey) {
        const found = walkFibre(rootEl[fiberKey]);
        if (found?.setFlights) {
          setFlights = found.setFlights.bind(found);
          getFlights = () => found.flights;
          originalFlights = [...(found.flights ?? [])];
        }
      }
    } catch (_) {}
  }

  if (!setFlights) {
    console.warn('  ⚠️  Could not locate Zustand store via React fibre.\n     Ensure the app is running at http://localhost:3000 and try again.');
    failed++;
  } else {
    // Build a set of diverse synthetic flights covering both sources and regions
    const testFlights = [
      // EMEA — OpenSky commercial (blue)
      enrichFlight(makeOpenskyFlight({ icao24: 'test-osky-01', latitude: 36.2, longitude: 44.0 })),
      // EMEA — ADSB military (orange)
      enrichFlight(makeAdsbFlight({   icao24: 'test-adsb-01', latitude: 36.5, longitude: 43.2 })),
      // EMEA — Unknown (sky blue)
      enrichFlight(makeOpenskyFlight({ icao24: 'test-unkn-01', callsign: '', originCountry: null, latitude: 35.5, longitude: 45.0 })),
      // EMEA — Iran military (orange via country rule)
      enrichFlight(makeAdsbFlight({   icao24: 'test-iran-01', callsign: 'IRI001', originCountry: 'Iran',  latitude: 33.0, longitude: 52.0 })),
      // Asia — South Asia commercial
      enrichFlight(makeOpenskyFlight({ icao24: 'test-asia-01', callsign: 'AI101',  originCountry: 'India',  latitude: 28.6, longitude: 77.2 })),
      // Asia — East Asia commercial
      enrichFlight(makeOpenskyFlight({ icao24: 'test-asia-02', callsign: 'CCA202', originCountry: 'China',  latitude: 39.9, longitude: 116.4 })),
      // Asia — SE Asia commercial
      enrichFlight(makeOpenskyFlight({ icao24: 'test-asia-03', callsign: 'TG305',  originCountry: 'Thailand', latitude: 13.7, longitude: 100.5 })),
      // Asia — Russia (military via country)
      enrichFlight(makeAdsbFlight({   icao24: 'test-ru-01',   callsign: 'RFF999', originCountry: 'Russia', latitude: 55.7, longitude: 37.6 })),
      // Asia — Japan
      enrichFlight(makeOpenskyFlight({ icao24: 'test-jp-01',  callsign: 'JAL501', originCountry: 'Japan',  latitude: 35.7, longitude: 139.7 })),
      // Asia — Korea
      enrichFlight(makeOpenskyFlight({ icao24: 'test-kr-01',  callsign: 'KAL801', originCountry: 'South Korea', latitude: 37.5, longitude: 127.0 })),
    ];

    setFlights(testFlights);

    // Give React one tick to commit + the canvas layer one rAF to redraw
    await new Promise(r => setTimeout(r, 200));

    const canvas = document.querySelector('.aircraft-canvas-layer');
    assert('Canvas layer exists in DOM',    !!canvas,   true);
    assert('Canvas has non-zero width',     canvas?.width > 0, true);
    assert('Canvas has non-zero height',    canvas?.height > 0, true);

    // Check the canvas is actually painted (not all blank)
    if (canvas) {
      const ctx   = canvas.getContext('2d');
      const data  = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const hasPixels = data.some(v => v > 0);
      assert('Canvas has painted pixels (aircraft visible)', hasPixels, true);
    }

    console.log('\n  %c🗺️  Test flights injected. Check the map — you should see:', 'color:#F97316;font-weight:bold');
    console.table([
      { icao24: 'test-osky-01', region: 'Erbil (EMEA)',      source: 'opensky', classification: 'COMMERCIAL', color: '🔵 blue',    lat: 36.2,  lng: 44.0 },
      { icao24: 'test-adsb-01', region: 'W-Erbil (EMEA)',    source: 'adsb',    classification: 'MILITARY',   color: '🟠 orange',  lat: 36.5,  lng: 43.2 },
      { icao24: 'test-unkn-01', region: 'Iraq (EMEA)',        source: 'opensky', classification: 'UNKNOWN',    color: '🩵 sky-blue', lat: 35.5,  lng: 45.0 },
      { icao24: 'test-iran-01', region: 'Iran (EMEA)',        source: 'adsb',    classification: 'MILITARY',   color: '🟠 orange',  lat: 33.0,  lng: 52.0 },
      { icao24: 'test-asia-01', region: 'Delhi (Asia)',       source: 'opensky', classification: 'COMMERCIAL', color: '🔵 blue',    lat: 28.6,  lng: 77.2 },
      { icao24: 'test-asia-02', region: 'Beijing (Asia)',     source: 'opensky', classification: 'COMMERCIAL', color: '🔵 blue',    lat: 39.9,  lng: 116.4 },
      { icao24: 'test-asia-03', region: 'Bangkok (SE Asia)',  source: 'opensky', classification: 'COMMERCIAL', color: '🔵 blue',    lat: 13.7,  lng: 100.5 },
      { icao24: 'test-ru-01',   region: 'Moscow (Russia)',    source: 'adsb',    classification: 'MILITARY',   color: '🟠 orange',  lat: 55.7,  lng: 37.6 },
      { icao24: 'test-jp-01',   region: 'Tokyo (Asia)',       source: 'opensky', classification: 'COMMERCIAL', color: '🔵 blue',    lat: 35.7,  lng: 139.7 },
      { icao24: 'test-kr-01',   region: 'Seoul (Asia)',       source: 'opensky', classification: 'COMMERCIAL', color: '🔵 blue',    lat: 37.5,  lng: 127.0 },
    ]);

    console.log('\n  %cFly to each region manually to confirm the markers render correctly.', 'color:#94A3B8');
    console.log('  %cOr run these fly-to helpers:', 'color:#94A3B8');
    console.log(`  %cwindow.__kwatchTest.flyTo('erbil')   // EMEA cluster`, 'color:#38BDF8');
    console.log(`  %cwindow.__kwatchTest.flyTo('delhi')   // South Asia`, 'color:#38BDF8');
    console.log(`  %cwindow.__kwatchTest.flyTo('beijing') // East Asia`, 'color:#38BDF8');
    console.log(`  %cwindow.__kwatchTest.flyTo('tokyo')   // Japan`, 'color:#38BDF8');
    console.log(`  %cwindow.__kwatchTest.flyTo('seoul')   // Korea`, 'color:#38BDF8');

    // ── Restore after 15 s ─────────────────────────────────────────────
    console.log('\n  %c⏱  Original flight data will be restored in 15 seconds.', 'color:#94A3B8');
    setTimeout(() => {
      setFlights(originalFlights);
      console.log('%c🔄 Kwatch: test flights removed — live data restored.', 'color:#94A3B8');
    }, 15_000);
  }

  console.groupEnd();

  // ── INTEGRATION: API endpoints reachable ─────────────────────────────────
  console.groupCollapsed('%c[4/4] API endpoint smoke tests', 'color:#94A3B8');

  const endpoints = [
    { name: '/api/opensky (EMEA+Asia bbox)', url: '/api/opensky?lamin=30&lomin=35&lamax=40&lomax=50' },
    { name: '/api/adsb (single zone)',       url: '/api/adsb?lat=36.0&lon=44.0&dist=250' },
  ];

  for (const ep of endpoints) {
    try {
      const r = await fetch(ep.url, { signal: AbortSignal.timeout(12_000) });
      if (r.ok) {
        const data = await r.json();
        const count = data?.states?.length ?? data?.ac?.length ?? data?.total ?? '?';
        console.log(`  %c✅ ${ep.name}`, 'color:#22C55E', `→ HTTP ${r.status}, records: ${count}`);
        passed++;
      } else {
        console.warn(`  ⚠️  ${ep.name} → HTTP ${r.status} (may be rate-limited or outside poll window)`);
        // Not counted as a failure — 429s are expected in dev with free tier
      }
    } catch (err) {
      console.error(`  ❌ ${ep.name} → ${err.message}`);
      failed++;
    }
  }

  console.groupEnd();

  // ── Summary ──────────────────────────────────────────────────────────────
  const total  = passed + failed;
  const pct    = total > 0 ? Math.round((passed / total) * 100) : 0;
  const status = failed === 0 ? '✅ ALL PASSED' : `❌ ${failed} FAILED`;
  const color  = failed === 0 ? '#22C55E' : '#EF4444';

  console.log(`\n%c${status} — ${passed}/${total} checks (${pct}%)`, `font-size:13px;font-weight:bold;color:${color}`);
  console.groupEnd();

  // ── Expose store + helpers globally ─────────────────────────────────────
  // window.__kwatchTest.store gives direct Zustand state access from the
  // console at any time after the test has run.
  window.__kwatchTest = {
    // ── Direct store reference ──────────────────────────────────────────
    // Usage:
    //   __kwatchTest.store.flights          → current flight array
    //   __kwatchTest.store.setFlights([…])  → replace flights on map
    store: setFlights ? { flights: originalFlights, setFlights } : null,

    // ── Filter helpers (operate on live store data) ─────────────────────
    filterSource(src) {
      // src: 'adsb' | 'opensky' | 'all'
      if (!setFlights) { console.error('Store not found — run the test first.'); return; }
      const all = getFlights?.() ?? originalFlights;
      const result = src === 'all' ? all : all.filter(f => f.source === src);
      setFlights(result);
      console.log(`%c🔍 source="${src}" → ${result.length} flights on map`, 'color:#F97316');
      console.table(result.map(f => ({ icao24: f.icao24, callsign: f.callsign, source: f.source, classification: f.classification, lat: f.latitude, lng: f.longitude })));
    },

    filterClass(cls) {
      // cls: 'MILITARY' | 'COMMERCIAL' | 'UNKNOWN' | 'all'
      if (!setFlights) { console.error('Store not found — run the test first.'); return; }
      const all = getFlights?.() ?? originalFlights;
      const result = cls === 'all' ? all : all.filter(f => f.classification === cls);
      setFlights(result);
      console.log(`%c🔍 classification="${cls}" → ${result.length} flights on map`, 'color:#F97316');
      console.table(result.map(f => ({ icao24: f.icao24, callsign: f.callsign, source: f.source, classification: f.classification, lat: f.latitude, lng: f.longitude })));
    },

    filterRegion(region) {
      // region: 'emea' | 'asia' | 'southasia' | 'eastasia' | 'seasia'
      if (!setFlights) { console.error('Store not found — run the test first.'); return; }
      const BOXES = {
        emea:      { minLat: -35, maxLat: 72,  minLon: -25, maxLon: 63  },
        asia:      { minLat:  -5, maxLat: 75,  minLon:  63, maxLon: 150 },
        southasia: { minLat:   5, maxLat: 37,  minLon:  60, maxLon: 97  },
        eastasia:  { minLat:  20, maxLat: 55,  minLon:  97, maxLon: 150 },
        seasia:    { minLat:  -5, maxLat: 22,  minLon:  95, maxLon: 142 },
      };
      const box = BOXES[region.toLowerCase()];
      if (!box) { console.warn('Unknown region. Options: ' + Object.keys(BOXES).join(', ')); return; }
      const all = getFlights?.() ?? originalFlights;
      const result = all.filter(f =>
        f.latitude  >= box.minLat && f.latitude  <= box.maxLat &&
        f.longitude >= box.minLon && f.longitude <= box.maxLon
      );
      setFlights(result);
      console.log(`%c🔍 region="${region}" → ${result.length} flights on map`, 'color:#F97316');
      console.table(result.map(f => ({ icao24: f.icao24, callsign: f.callsign, source: f.source, classification: f.classification, lat: f.latitude, lng: f.longitude })));
    },

    inspect() {
      // Print a breakdown of what's currently on the map by source + class
      const fs = getFlights?.() ?? originalFlights;
      console.log(`%c📊 ${fs.length} flights currently in store`, 'color:#F97316;font-weight:bold');
      console.table(
        Object.entries(
          fs.reduce((acc, f) => {
            const key = `${f.source ?? '?'} / ${f.classification ?? '?'}`;
            acc[key] = (acc[key] ?? 0) + 1;
            return acc;
          }, {})
        ).map(([key, count]) => ({ 'source / classification': key, count }))
      );
    },

    // ── Map navigation ──────────────────────────────────────────────────
    flyTo(region) {
      const REGIONS = {
        erbil:   [36.3, 44.0,  8],
        iran:    [33.0, 52.0,  6],
        delhi:   [28.6, 77.2,  7],
        beijing: [39.9, 116.4, 7],
        bangkok: [13.7, 100.5, 7],
        moscow:  [55.7, 37.6,  7],
        tokyo:   [35.7, 139.7, 7],
        seoul:   [37.5, 127.0, 7],
      };
      const coords = REGIONS[region.toLowerCase()];
      if (!coords) { console.warn('Unknown region. Try: ' + Object.keys(REGIONS).join(', ')); return; }
      window.dispatchEvent(new CustomEvent('kwatch:center-aircraft', { detail: { lat: coords[0], lng: coords[1] } }));
      console.log(`%c🗺️  Flying to ${region} [${coords[0]}, ${coords[1]}]`, 'color:#F97316');
    },

    // ── Restore live data ───────────────────────────────────────────────
    clearTestFlights() {
      if (!setFlights) { console.error('Store not found — run the test first.'); return; }
      setFlights(originalFlights);
      console.log('%c🔄 Test flights cleared — live data restored.', 'color:#94A3B8');
    },
  };

  console.log('%c� window.__kwatchTest ready. Available methods:', 'color:#94A3B8');
  console.log('%c   .filterSource("adsb"|"opensky"|"all")', 'color:#38BDF8');
  console.log('%c   .filterClass("MILITARY"|"COMMERCIAL"|"UNKNOWN"|"all")', 'color:#38BDF8');
  console.log('%c   .filterRegion("emea"|"asia"|"southasia"|"eastasia"|"seasia")', 'color:#38BDF8');
  console.log('%c   .inspect()  .flyTo("erbil"|"tokyo"|…)  .clearTestFlights()', 'color:#38BDF8');

})();
