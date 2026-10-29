// Privacy offset: move a real coordinate 1–3 km in a random direction so the
// dot is placed *near* the user, never at their exact location. A fresh random
// offset is generated each session (this runs once per join), so the same user
// lands somewhere different every time.

const KM_PER_DEG_LAT = 111.32;

export function applyPrivacyOffset(
  lat: number,
  lng: number,
): { lat: number; lng: number } {
  const distanceKm = 1 + Math.random() * 2; // 1–3 km
  const bearing = Math.random() * 2 * Math.PI; // random direction

  const dLat = (distanceKm * Math.cos(bearing)) / KM_PER_DEG_LAT;
  const latRad = (lat * Math.PI) / 180;
  const dLng =
    (distanceKm * Math.sin(bearing)) /
    (KM_PER_DEG_LAT * Math.cos(latRad) || KM_PER_DEG_LAT);

  return {
    lat: clamp(lat + dLat, -90, 90),
    lng: wrapLng(lng + dLng),
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function wrapLng(lng: number): number {
  // Keep longitude in [-180, 180].
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

// "How far, and roughly where?" for the person you're talking to. Both
// inputs are the already-public *offset* dot positions, so this reveals
// nothing the map doesn't already show.

type Point = { lat: number; lng: number };

export function distanceKm(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// Each dot is offset 1-3 km, so anything finer than ~10 km would be false
// precision.
export function formatDistance(km: number): string {
  if (km < 10) return "less than 10 km away";
  const step = km < 100 ? 5 : km < 1000 ? 10 : 100;
  return `about ${(Math.round(km / step) * step).toLocaleString()} km away`;
}

const cache = new Map<string, string | null>();

// City-level name via Mapbox reverse geocoding: one lookup per call, never
// per dot. Null over the ocean or if the lookup fails.
export async function placeName({ lat, lng }: Point): Promise<string | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return null;
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  if (cache.has(key)) return cache.get(key)!;
  let name: string | null = null;
  try {
    const res = await fetch(
      `https://api.mapbox.com/search/geocode/v6/reverse?longitude=${lng}&latitude=${lat}&types=place,region,country&limit=1&access_token=${token}`,
    );
    const props = (await res.json()).features?.[0]?.properties;
    if (props?.name) {
      const country = props.context?.country?.name;
      name = country && country !== props.name ? `${props.name}, ${country}` : props.name;
    }
  } catch {}
  cache.set(key, name);
  return name;
}
