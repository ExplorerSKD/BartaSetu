export function formatTime(ms: number): string {
  const date = new Date(ms);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const hh = date.getHours();
  const mm = date.getMinutes().toString().padStart(2, '0');
  const time = `${((hh + 11) % 12) + 1}:${mm} ${hh < 12 ? 'AM' : 'PM'}`;
  if (sameDay) return time;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${date.getDate()} ${months[date.getMonth()]}`;
}

export function formatClock(ms: number): string {
  const date = new Date(ms);
  const hh = date.getHours();
  return `${((hh + 11) % 12) + 1}:${date.getMinutes().toString().padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
}

export function timeAgo(ms: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export function formatDistance(meters?: number | null): string | null {
  if (meters == null || !isFinite(meters)) return null;
  if (meters < 1000) return `~${Math.max(1, Math.round(meters))} m`;
  return `~${(meters / 1000).toFixed(1)} km`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Accepts "BS-7K3Q9X", "bs7k3q9x" or "7k3q9x" and returns "BS-7K3Q9X". */
export function normalizeBsId(input: string): string {
  const cleaned = input.trim().toUpperCase().replace(/\s+/g, '');
  if (cleaned.startsWith('BS-')) return cleaned;
  if (cleaned.startsWith('BS') && cleaned.length === 8) return `BS-${cleaned.slice(2)}`;
  return `BS-${cleaned.replace(/^-+/, '')}`;
}

export function isValidBsId(input: string): boolean {
  return /^BS-[2-9A-HJ-NP-TV-Z]{6}$/.test(normalizeBsId(input));
}

/** Rough distance from BLE signal strength using the log-distance path loss model. */
export function rssiToMeters(rssi?: number): number | null {
  if (rssi == null || rssi === 0) return null;
  const txPower = -59;
  return Math.round(Math.pow(10, (txPower - rssi) / 20) * 10) / 10;
}

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
