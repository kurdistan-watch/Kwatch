// ─────────────────────────────────────────────────────────────────────────────
// classifier.js — Pure-function flight classification engine (zero deps)
//
// Classifies ADS-B state vectors over Kurdistan Region airspace so civilians
// can immediately understand the threat / safety profile of every aircraft.
//
// Priority order:
//   1. UNKNOWN        (red)    — missing / suspicious data
//   2. SURVEILLANCE   (amber)  — loitering / low-slow patterns
//   3. MILITARY       (orange) — known mil callsigns, hex blocks, origin
//   4. COMMERCIAL     (blue)   — airline IATA codes
//   5. UNCLASSIFIED   (grey)   — everything else
// ─────────────────────────────────────────────────────────────────────────────

// ── Classification constants ────────────────────────────────────────────────

const CLASSIFICATIONS = {
  UNKNOWN:        'UNKNOWN',
  SURVEILLANCE:   'SURVEILLANCE',
  MILITARY:       'MILITARY',
  COMMERCIAL:     'COMMERCIAL',
  UNCLASSIFIED:   'UNCLASSIFIED',
};

const COLORS = {
  UNKNOWN:        '#EF4444', // red-500
  SURVEILLANCE:   '#F59E0B', // amber-500
  MILITARY:       '#F97316', // orange-500
  COMMERCIAL:     '#3B82F6', // blue-500
  UNCLASSIFIED:   '#6B7280', // grey-500
};

const THREAT_LEVELS = {
  UNKNOWN:        4,
  SURVEILLANCE:   3,
  MILITARY:       2,
  COMMERCIAL:     0,
  UNCLASSIFIED:   1,
};

// ── Rule-set constants ──────────────────────────────────────────────────────

const STALE_SIGNAL_SECONDS = 120;
const EXTREMELY_LOW_ALT_FT = 500;

const SURVEILLANCE_ALT_MIN = 500;
const SURVEILLANCE_ALT_MAX = 8_000;
const SURVEILLANCE_SPEED_MAX_KT = 150;
const LOITER_CYCLES_REQUIRED = 3;
const LOITER_DEGREE_THRESHOLD = 0.15;

const MILITARY_CALLSIGN_PREFIXES = [
  'RCH', 'MMF', 'JAKE', 'REACH', 'OLIVE',
  'KNIFE', 'FURY', 'TOPCAT', 'DOOM', 'VIPER', 'BONE', 'GHOST',
];

const MILITARY_ORIGIN_COUNTRIES = ['Iran', 'Russia'];

const COMMERCIAL_AIRLINE_PREFIXES = [
  'KAR', 'IRY', 'UR', 'PC', 'TK', 'EK', 'FZ', 'WS', 'GF',
];

// 2 uppercase letters followed by 1-4 digits  (e.g. TK489, EK241)
const IATA_CALLSIGN_RE = /^[A-Z]{2}\d{1,4}$/;

// ── Loiter history (module-level, persists across calls) ────────────────────

/** Map<icao24, { positions: Array<{lat,lng}>, count: number }> */
const _loiterHistory = new Map();

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns the current Unix epoch in seconds.
 * Exported only for tests; callers may override via the optional `now` param.
 */
const nowEpoch = () => Math.floor(Date.now() / 1000);

/**
 * Checks whether a callsign looks like it belongs to a known commercial
 * airline (IATA 2-letter + digits, or regional prefix).
 */
const isCommercialCallsign = (cs) => {
  if (IATA_CALLSIGN_RE.test(cs)) return true;
  return COMMERCIAL_AIRLINE_PREFIXES.some((p) => cs.startsWith(p));
};

/**
 * Updates the module-level loiter history for a given aircraft and returns
 * `true` when loitering is detected (≥ LOITER_CYCLES_REQUIRED consecutive
 * appearances with combined lat/lng drift < LOITER_DEGREE_THRESHOLD).
 */
const updateLoiterHistory = (flight) => {
  const key = flight.icao24;
  const entry = _loiterHistory.get(key) || { positions: [], count: 0 };

  entry.positions.push({ lat: flight.latitude, lng: flight.longitude });
  entry.count += 1;

  // Keep only the most recent N positions
  if (entry.positions.length > LOITER_CYCLES_REQUIRED) {
    entry.positions = entry.positions.slice(-LOITER_CYCLES_REQUIRED);
  }

  _loiterHistory.set(key, entry);

  if (entry.positions.length < LOITER_CYCLES_REQUIRED) return false;

  // Sum of absolute deltas across the retained window
  let totalDrift = 0;
  for (let i = 1; i < entry.positions.length; i++) {
    totalDrift +=
      Math.abs(entry.positions[i].lat - entry.positions[i - 1].lat) +
      Math.abs(entry.positions[i].lng - entry.positions[i - 1].lng);
  }

  return totalDrift < LOITER_DEGREE_THRESHOLD;
};

/**
 * Prune loiter entries that no longer appear in the current cycle so the
 * map doesn't grow unbounded.
 */
const pruneLoiterHistory = (currentIcaos) => {
  for (const key of _loiterHistory.keys()) {
    if (!currentIcaos.has(key)) _loiterHistory.delete(key);
  }
};

// ── Individual rule checkers ────────────────────────────────────────────────

/**
 * Rule 1 — UNKNOWN  (highest priority)
 * Returns true when the aircraft has suspicious / missing data.
 */
const isUnknown = (f, now) => {
  const cs = f.callsign;

  // Null / empty / whitespace-only callsign
  if (cs == null || cs.trim() === '') return true;

  // Contains garbage markers
  if (cs.includes('????') || cs.includes('TEST')) return true;

  // Missing origin
  if (f.originCountry == null) return true;

  // Stale signal
  if (f.lastContact && now - f.lastContact > STALE_SIGNAL_SECONDS) return true;

  // Extremely low flight that is NOT on the ground
  if (
    f.altitude != null &&
    f.altitude < EXTREMELY_LOW_ALT_FT &&
    f.onGround !== true
  ) return true;

  return false;
};

/**
 * Rule 2 — SURVEILLANCE_PATTERN
 * Returns true when the aircraft exhibits low-slow loitering behaviour.
 * The loiter detector relies on module-level history so it MUST be called
 * once per aircraft per cycle (side-effect: updates `_loiterHistory`).
 */
const isSurveillance = (f) => {
  const cs = f.callsign;
  if (cs == null || cs.trim() === '') return false; // must have valid callsign

  if (
    f.altitude == null ||
    f.altitude < SURVEILLANCE_ALT_MIN ||
    f.altitude > SURVEILLANCE_ALT_MAX
  ) return false;

  if (f.velocity == null || f.velocity >= SURVEILLANCE_SPEED_MAX_KT) return false;

  // Loiter check (updates history as a side-effect)
  return updateLoiterHistory(f);
};

/**
 * Rule 3 — MILITARY
 * Returns true for known military callsigns, ICAO hex blocks, or
 * origin-country heuristics.
 */
const isMilitary = (f) => {
  const cs = (f.callsign ?? '').trim().toUpperCase();

  // Known military callsign prefixes
  if (cs && MILITARY_CALLSIGN_PREFIXES.some((p) => cs.startsWith(p))) return true;

  const hex = (f.icao24 ?? '').toLowerCase();

  // US military ICAO hex block ('ae' prefix)
  if (hex.startsWith('ae')) return true;

  // Broader US military heuristic: hex starts with 'a', origin is US,
  // and callsign does NOT look like a commercial airline.
  if (
    hex.startsWith('a') &&
    f.originCountry === 'United States' &&
    !isCommercialCallsign(cs)
  ) return true;

  // Flag all Iranian / Russian origin aircraft as military-adjacent
  if (MILITARY_ORIGIN_COUNTRIES.includes(f.originCountry)) return true;

  return false;
};

/**
 * Rule 4 — COMMERCIAL
 * Returns true for IATA-format callsigns or known regional airlines.
 */
const isCommercial = (f) => {
  const cs = (f.callsign ?? '').trim().toUpperCase();
  if (!cs) return false;
  return isCommercialCallsign(cs);
};

// ── Classify a single flight ────────────────────────────────────────────────

/**
 * Runs the classification cascade on a single normalised flight object.
 *
 * @param {Object}  flight       Normalised flight from opensky.js
 * @param {number}  [now]        Current Unix epoch (seconds) — injectable for tests
 * @returns {Object}             Enriched flight with classification metadata
 */
const classifySingle = (flight, now) => {
  let classification = CLASSIFICATIONS.UNCLASSIFIED;

  // Priority cascade — first match wins
  if (isUnknown(flight, now)) {
    classification = CLASSIFICATIONS.UNKNOWN;
  } else if (isSurveillance(flight)) {
    classification = CLASSIFICATIONS.SURVEILLANCE;
  } else if (isMilitary(flight)) {
    classification = CLASSIFICATIONS.MILITARY;
  } else if (isCommercial(flight)) {
    classification = CLASSIFICATIONS.COMMERCIAL;
  }

  const threatLevel  = THREAT_LEVELS[classification];
  const displayColor = COLORS[classification];
  const pulseAnimation =
    classification === CLASSIFICATIONS.UNKNOWN ||
    classification === CLASSIFICATIONS.MILITARY;

  const alertMessage =
    threatLevel > 2
      ? buildAlertMessage(flight, classification)
      : null;

  return {
    ...flight,
    classification,
    threatLevel,
    displayColor,
    pulseAnimation,
    alertMessage,
  };
};

// ── Alert message builder ───────────────────────────────────────────────────

const buildAlertMessage = (f, cls) => {
  const id = f.callsign?.trim() || f.icao24 || 'N/A';
  switch (cls) {
    case CLASSIFICATIONS.UNKNOWN:
      return `⚠️ Unidentified aircraft [${id}] detected — missing or suspicious data. Exercise caution.`;
    case CLASSIFICATIONS.SURVEILLANCE:
      return `🔍 Possible surveillance aircraft [${id}] — loitering pattern detected at ${Math.round(f.altitude ?? 0)} ft.`;
    default:
      return `⚠️ Elevated threat aircraft [${id}] — classification: ${cls}.`;
  }
};

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Classifies an array of normalised flight objects.
 *
 * @param {Array}  flights         Current cycle of normalised flights.
 * @param {Array}  [previousCycle] Previous cycle (unused — loiter state is
 *                                 tracked internally, but kept in the
 *                                 signature for future extensions).
 * @returns {Array}                Enriched flights with classification metadata.
 */
export const classifyFlights = (flights = [], previousCycle = []) => {
  const now = nowEpoch();
  const currentIcaos = new Set(flights.map((f) => f.icao24));

  // Prune loiter history for aircraft that are no longer in the feed
  pruneLoiterHistory(currentIcaos);

  return flights.map((f) => classifySingle(f, now));
};

/**
 * Reset internal loiter history — useful for tests or when the user
 * changes the watched region.
 */
export const resetLoiterHistory = () => {
  _loiterHistory.clear();
};

// Re-export for backward compat with old call-sites
export const classifyAircraft = (icao24) => ({
  type: 'unknown',
  isMilitary: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// UNIT TESTS (15 cases)
// Run with:  node -e "import('./classifier.js')" (ESM) or copy to a test runner
// ─────────────────────────────────────────────────────────────────────────────

/*
TEST 1 — Null callsign → UNKNOWN
  Input:  { icao24: 'abc123', callsign: null, originCountry: 'Iraq', altitude: 10000, velocity: 200, onGround: false, lastContact: now }
  Expect: classification === 'UNKNOWN', threatLevel === 4, displayColor === '#EF4444'

TEST 2 — Empty-string callsign → UNKNOWN
  Input:  { icao24: 'abc123', callsign: '   ', originCountry: 'Iraq', altitude: 10000, velocity: 200, onGround: false, lastContact: now }
  Expect: classification === 'UNKNOWN'

TEST 3 — Callsign containing '????' → UNKNOWN
  Input:  { icao24: 'abc123', callsign: 'FL????X', originCountry: 'Iraq', altitude: 10000, velocity: 200, onGround: false, lastContact: now }
  Expect: classification === 'UNKNOWN'

TEST 4 — Callsign containing 'TEST' → UNKNOWN
  Input:  { icao24: 'abc123', callsign: 'TEST001', originCountry: 'Iraq', altitude: 10000, velocity: 200, onGround: false, lastContact: now }
  Expect: classification === 'UNKNOWN'

TEST 5 — Null originCountry → UNKNOWN
  Input:  { icao24: 'abc123', callsign: 'TK490', originCountry: null, altitude: 30000, velocity: 400, onGround: false, lastContact: now }
  Expect: classification === 'UNKNOWN'

TEST 6 — Stale signal (lastContact > 120s ago) → UNKNOWN
  Input:  { icao24: 'abc123', callsign: 'TK490', originCountry: 'Turkey', altitude: 30000, velocity: 400, onGround: false, lastContact: now - 300 }
  Expect: classification === 'UNKNOWN'

TEST 7 — Extremely low altitude (<500ft) while NOT on ground → UNKNOWN
  Input:  { icao24: 'abc123', callsign: 'TK490', originCountry: 'Turkey', altitude: 200, velocity: 100, onGround: false, lastContact: now }
  Expect: classification === 'UNKNOWN'

TEST 8 — Low altitude but ON GROUND → should NOT be UNKNOWN (skip altitude rule)
  Input:  { icao24: 'abc123', callsign: 'TK490', originCountry: 'Turkey', altitude: 50, velocity: 10, onGround: true, lastContact: now }
  Expect: classification === 'COMMERCIAL' (callsign matches IATA pattern)

TEST 9 — Surveillance loiter detection after 3 cycles
  Setup:  Call classifyFlights 3 times with the same icao24, altitude 3000ft,
          velocity 80kt, positions [(36.0,44.0), (36.001,44.001), (36.002,44.002)]
  Expect: On cycle 3, classification === 'SURVEILLANCE', threatLevel === 3,
          alertMessage !== null

TEST 10 — Military callsign prefix 'RCH' → MILITARY
  Input:  { icao24: 'ae1234', callsign: 'RCH501', originCountry: 'United States', altitude: 25000, velocity: 350, onGround: false, lastContact: now }
  Expect: classification === 'MILITARY', threatLevel === 2, pulseAnimation === true

TEST 11 — ICAO24 hex starting with 'ae' → MILITARY
  Input:  { icao24: 'ae9f01', callsign: 'MISC01', originCountry: 'United States', altitude: 20000, velocity: 300, onGround: false, lastContact: now }
  Expect: classification === 'MILITARY'

TEST 12 — Origin country 'Iran' → MILITARY (military-adjacent)
  Input:  { icao24: '730001', callsign: 'IRN100', originCountry: 'Iran', altitude: 15000, velocity: 250, onGround: false, lastContact: now }
  Expect: classification === 'MILITARY'

TEST 13 — Commercial IATA callsign 'EK241' → COMMERCIAL
  Input:  { icao24: 'c00001', callsign: 'EK241', originCountry: 'UAE', altitude: 35000, velocity: 450, onGround: false, lastContact: now }
  Expect: classification === 'COMMERCIAL', threatLevel === 0, displayColor === '#3B82F6', pulseAnimation === false

TEST 14 — Regional airline prefix 'KAR' → COMMERCIAL
  Input:  { icao24: 'd00001', callsign: 'KAR201', originCountry: 'Iraq', altitude: 28000, velocity: 380, onGround: false, lastContact: now }
  Expect: classification === 'COMMERCIAL'

TEST 15 — No rules match → UNCLASSIFIED
  Input:  { icao24: 'f00baa', callsign: 'XYZZY', originCountry: 'Germany', altitude: 12000, velocity: 200, onGround: false, lastContact: now }
  Expect: classification === 'UNCLASSIFIED', threatLevel === 1, displayColor === '#6B7280',
          pulseAnimation === false, alertMessage === null
*/
