// ─────────────────────────────────────────────────────────────────────────────
// classifier.js — Pure-function flight classification engine (zero deps)
//
// Three classifications in priority order:
//   1. UNKNOWN    (bright blue) — missing / incomplete data
//   2. MILITARY   (orange)      — known mil callsigns, hex blocks, origin country
//   3. COMMERCIAL (blue)        — everything else
// ─────────────────────────────────────────────────────────────────────────────

// ── Classification constants ────────────────────────────────────────────────

const CLASSIFICATIONS = {
  UNKNOWN:    'UNKNOWN',
  MILITARY:   'MILITARY',
  COMMERCIAL: 'COMMERCIAL',
};

const COLORS = {
  UNKNOWN:    '#38BDF8', // sky-400 bright blue
  MILITARY:   '#F97316', // orange-500
  COMMERCIAL: '#3B82F6', // blue-500
};

const THREAT_LEVELS = {
  UNKNOWN:    3,
  MILITARY:   2,
  COMMERCIAL: 0,
};

// ── Rule-set constants ──────────────────────────────────────────────────────

const STALE_SIGNAL_SECONDS = 120;
const EXTREMELY_LOW_ALT_FT = 500;

const MILITARY_CALLSIGN_PREFIXES = [
  // US Air Force / Air Mobility Command
  'RCH', 'REACH', 'MMF', 'JAKE', 'OLIVE',
  'KNIFE', 'FURY', 'TOPCAT', 'DOOM', 'VIPER', 'BONE', 'GHOST',
  // US Navy
  'CNV', 'NAVY',
  // UK Royal Air Force
  'RRR', 'ASCOT', 'COMET', 'TARTAN',
  // French Air Force (Armée de l'air)
  'RFR', 'FAF', 'COTAM',
  // NATO / Multi-national
  'NATO', 'MAGIC',
  // Turkish Air Force (active operations in northern Iraq)
  'TUAF', 'KAFKAS',
  // MENA regional militaries
  'JAF', 'RJAF', 'SAF', 'PAF',
];

const COMMERCIAL_AIRLINE_PREFIXES = [
  'KAR', 'IRY', 'UR', 'PC', 'TK', 'EK', 'FZ', 'WS', 'GF',
];

// 2 uppercase letters followed by 1-4 digits (e.g. TK489, EK241)
const IATA_CALLSIGN_RE = /^[A-Z]{2}\d{1,4}$/;

// ── Helpers ─────────────────────────────────────────────────────────────────

const nowEpoch = () => Math.floor(Date.now() / 1000);

const isCommercialCallsign = (cs) => {
  if (IATA_CALLSIGN_RE.test(cs)) return true;
  return COMMERCIAL_AIRLINE_PREFIXES.some((p) => cs.startsWith(p));
};

// ── Rule checkers ───────────────────────────────────────────────────────────

const isUnknown = (f, now) => {
  const cs = f.callsign;
  if (cs == null || cs.trim() === '') return true;
  if (cs.includes('????') || cs.includes('TEST')) return true;
  if (f.originCountry == null) return true;
  if (f.lastContact && now - f.lastContact > STALE_SIGNAL_SECONDS) return true;
  if (f.altitude != null && f.altitude < EXTREMELY_LOW_ALT_FT && f.onGround !== true) return true;
  return false;
};

const isMilitary = (f) => {
  const cs  = (f.callsign ?? '').trim().toUpperCase();
  const hex = (f.icao24  ?? '').toLowerCase();

  if (cs && MILITARY_CALLSIGN_PREFIXES.some((p) => cs.startsWith(p))) return true;
  if (hex.startsWith('ae')) return true;                                                          // US military ICAO24 block
  if (hex.startsWith('43') && f.originCountry === 'United Kingdom') return true;                  // UK military ICAO24 block
  if (hex.startsWith('a') && f.originCountry === 'United States' && !isCommercialCallsign(cs)) return true;

  return false;
};

// ── Classify a single flight ────────────────────────────────────────────────

const buildAlertMessage = (f, cls) => {
  const id = f.callsign?.trim() || f.icao24 || 'N/A';
  if (cls === CLASSIFICATIONS.UNKNOWN)
    return `⚠️ Unidentified aircraft [${id}] — missing or suspicious data.`;
  if (cls === CLASSIFICATIONS.MILITARY)
    return `🟠 Military aircraft [${id}] detected — origin: ${f.originCountry ?? 'unknown'}.`;
  return null;
};

const classifySingle = (flight, now) => {
  let classification;

  if (isUnknown(flight, now)) {
    classification = CLASSIFICATIONS.UNKNOWN;
  } else if (isMilitary(flight)) {
    classification = CLASSIFICATIONS.MILITARY;
  } else {
    classification = CLASSIFICATIONS.COMMERCIAL;
  }

  const threatLevel    = THREAT_LEVELS[classification];
  const displayColor   = COLORS[classification];
  const pulseAnimation = classification === CLASSIFICATIONS.MILITARY;
  const alertMessage   = threatLevel > 1 ? buildAlertMessage(flight, classification) : null;

  return { ...flight, classification, threatLevel, displayColor, pulseAnimation, alertMessage };
};

// ── Public API ──────────────────────────────────────────────────────────────

export const classifyFlights = (flights = []) => {
  const now = nowEpoch();
  return flights.map((f) => classifySingle(f, now));
};

export const resetLoiterHistory = () => {}; // no-op, kept for compat

export const classifyAircraft = () => ({ type: 'unknown', isMilitary: false }); // compat stub
