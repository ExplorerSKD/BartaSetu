/**
 * Runtime configuration.
 * Set EXPO_PUBLIC_API_URL (e.g. in mobile/.env) to point the app at your backend;
 * the live VPS below is the default.
 */
const FALLBACK_API_URL = 'https://bartasetu.srv1857933.hstgr.cloud';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || FALLBACK_API_URL).replace(/\/+$/, '');
export const WS_URL = API_URL.replace(/^http/, 'ws');

export const MESH = {
  /** A message stops being forwarded after this many phone-to-phone hops. */
  MAX_HOPS: 10,
  /** Messages expire after 24 hours in the mesh. */
  TTL_SECONDS: 24 * 60 * 60,
  /** How many relay phones (besides gateways and the recipient) receive a copy. */
  MAX_RELAY_COPIES: 3,
  /** How often queued messages are re-offered to nearby phones. */
  PUMP_INTERVAL_MS: 15_000,
  /** A BLE-only peer counts as nearby for this long after it was last seen. */
  BLE_PEER_TTL_MS: 45_000,
};
