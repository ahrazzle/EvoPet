/**
 * One reader for the library service's public index.
 *
 * The shapes here are copied from `evopet-library/src/manifest.ts`, field for
 * field, because that file is the contract: `generatedAt`, `total`,
 * `capableTotal`, `assetBase` and a `pets` array of `slug`, `displayName`,
 * `thumbnailUrl`, `capable`, `evopet`, `petJsonUrl`, `spritesheetUrl`,
 * `version`, `updatedAt`. Nothing is added to it here and nothing is guessed:
 * a field the API did not send stays absent, and no placeholder row is ever
 * rendered in its place.
 */

declare const __EVOPET_LIBRARY_ENDPOINT__: string;
declare const __EVOPET_LIBRARY_PROXIED__: boolean;

export interface ManifestPet {
  slug: string;
  displayName: string;
  thumbnailUrl: string | null;
  capable: boolean;
  evopet: Record<string, unknown> | null;
  petJsonUrl: string;
  spritesheetUrl: string;
  version: string;
  updatedAt: string;
}

export interface ManifestPayload {
  generatedAt: string;
  total: number;
  capableTotal: number;
  assetBase: string;
  pets: ManifestPet[];
}

/** The endpoint the build baked in. `/api` when the dev proxy is in use. */
export const LIBRARY_ENDPOINT: string =
  typeof __EVOPET_LIBRARY_ENDPOINT__ === 'string' ? __EVOPET_LIBRARY_ENDPOINT__ : '';
export const LIBRARY_PROXIED: boolean =
  typeof __EVOPET_LIBRARY_PROXIED__ === 'boolean' ? __EVOPET_LIBRARY_PROXIED__ : false;

export function manifestUrl(endpoint: string = LIBRARY_ENDPOINT): string {
  const base = endpoint.replace(/\/+$/, '');
  return `${base}/api/manifest`;
}

export class ManifestError extends Error {
  readonly url: string;
  constructor(message: string, url: string) {
    super(message);
    this.name = 'ManifestError';
    this.url = url;
  }
}

function isPet(value: unknown): value is ManifestPet {
  if (!value || typeof value !== 'object') return false;
  const pet = value as Record<string, unknown>;
  return typeof pet.slug === 'string' && typeof pet.displayName === 'string';
}

/** The index, or a thrown ManifestError naming the URL that failed. */
export async function fetchManifest(
  endpoint: string = LIBRARY_ENDPOINT,
  signal?: AbortSignal,
): Promise<ManifestPayload> {
  const url = manifestUrl(endpoint);
  let response: Response;
  try {
    response = await fetch(url, { headers: { accept: 'application/json' }, signal });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ManifestError(
      reason === 'Failed to fetch'
        ? 'the request did not complete — the host did not answer, or it refused a different origin'
        : reason,
      url,
    );
  }

  if (!response.ok) {
    throw new ManifestError(`the service answered ${response.status} ${response.statusText}`, url);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ManifestError('the response was not JSON', url);
  }

  const candidate = payload as Partial<ManifestPayload> | null;
  if (!candidate || !Array.isArray(candidate.pets)) {
    throw new ManifestError('the response carried no pets array', url);
  }

  return {
    generatedAt: typeof candidate.generatedAt === 'string' ? candidate.generatedAt : '',
    total: typeof candidate.total === 'number' ? candidate.total : candidate.pets.length,
    capableTotal:
      typeof candidate.capableTotal === 'number'
        ? candidate.capableTotal
        : candidate.pets.filter((pet) => isPet(pet) && pet.capable).length,
    assetBase: typeof candidate.assetBase === 'string' ? candidate.assetBase : '',
    pets: candidate.pets.filter(isPet),
  };
}

/** The declared gate levels from a pet's `evopet` block, or an empty list. */
export function declaredGates(pet: ManifestPet): number[] {
  const block = pet.evopet;
  if (!block || typeof block !== 'object') return [];
  const raw = (block as Record<string, unknown>).evolutionGates;
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is number => typeof value === 'number');
}

/** `12 pets · 3 evolving` — counted from the payload, never typed in. */
export function statusText(payload: ManifestPayload): string {
  return `${payload.total} pets · ${payload.capableTotal} evolving`;
}

/** ISO timestamp to `2026-09-11 19:35`, or the raw string if it is not a date. */
export function shortDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${parsed.getUTCFullYear()}-${pad(parsed.getUTCMonth() + 1)}-${pad(
    parsed.getUTCDate(),
  )} ${pad(parsed.getUTCHours())}:${pad(parsed.getUTCMinutes())} UTC`;
}
