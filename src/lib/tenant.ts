import { supabase } from './supabase';
import type { Restaurant } from '../types';

// The platform's own root domain. Only matters once a real domain, its
// wildcard DNS record (*.{ROOT}) and a host that supports wildcard domains
// are actually set up (GitHub Pages can't do wildcard custom domains).
// Until then no real hostname ever matches this, so every request falls
// through to the ?restaurant=slug / path-segment behavior this app already
// had -- local dev and the current GitHub Pages deployment are unaffected.
const PLATFORM_ROOT_DOMAIN = 'codex.com';

// Subdomains that belong to the platform itself, never to a tenant.
const RESERVED_SUBDOMAINS = new Set(['www', 'master', 'dashboard', 'api', 'admin', 'mail']);

export type TenantResolution =
  | { type: 'slug'; slug: string }
  | { type: 'custom_domain'; domain: string };

/**
 * Single source of truth for "which restaurant does this request mean".
 * Reads window.location.hostname once, here, so no screen re-derives it.
 *
 * 1. {slug}.{PLATFORM_ROOT_DOMAIN} (non-reserved) -> that slug.
 * 2. Any other hostname that isn't localhost / GitHub Pages / the bare
 *    root domain -> possible custom domain, looked up server-side.
 * 3. Everything else -> the pre-existing query-param/path behavior.
 */
export function resolveTenant(): TenantResolution {
  const hostname = window.location.hostname.toLowerCase();

  const isLocalOrStaticHost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.github.io') ||
    hostname === PLATFORM_ROOT_DOMAIN;

  if (!isLocalOrStaticHost && hostname.endsWith(`.${PLATFORM_ROOT_DOMAIN}`)) {
    const subdomain = hostname.slice(0, -(`.${PLATFORM_ROOT_DOMAIN}`.length));
    const label = subdomain.split('.')[0];
    if (label && !RESERVED_SUBDOMAINS.has(label)) {
      return { type: 'slug', slug: label };
    }
    // Reserved platform subdomain hitting the customer website: not a
    // tenant -- fall through to the legacy behavior rather than treating
    // e.g. "www" as a restaurant slug.
  } else if (!isLocalOrStaticHost) {
    return { type: 'custom_domain', domain: hostname };
  }

  return { type: 'slug', slug: getRestaurantSlugFromQueryOrPath() };
}

/** The behavior this app had before hostname resolution existed, unchanged. */
function getRestaurantSlugFromQueryOrPath(): string {
  const querySlug = new URLSearchParams(window.location.search).get('restaurant');
  if (querySlug?.trim()) return querySlug.trim().toLowerCase();

  const parts = window.location.pathname.split('/').filter(Boolean);
  const repoBase = 'cafe-website';
  const index = parts.indexOf(repoBase);
  const candidate = index >= 0 ? parts[index + 1] : parts[0];

  return candidate?.trim() ? candidate.trim().toLowerCase() : 'cafe';
}

/** Custom_domains has no public-read policy (it holds verification
 * tokens), so the anon-key website asks this SECURITY DEFINER RPC instead
 * of querying that table directly -- it exposes only the one thing the
 * site legitimately needs (a verified domain's restaurant slug). */
async function resolveRestaurantSlugByDomain(domain: string): Promise<string> {
  const { data, error } = await supabase.rpc('resolve_restaurant_by_domain', { p_domain: domain });
  if (error) throw error;
  if (!data) throw new Error(`No restaurant is configured for "${domain}".`);
  return data as string;
}

let resolvedSlug: string | null = null;

/** Resolved once, shared by every caller (the initial render in main.tsx
 * and the standalone async blocks further down that file that also need
 * the slug) -- so it doesn't matter what order those callers run in, or
 * whether resolution has already finished by the time they ask; they all
 * await the same in-flight (or already-settled) promise. */
export const tenantReady: Promise<void> = (async () => {
  const resolution = resolveTenant();
  if (resolution.type === 'slug') {
    resolvedSlug = resolution.slug;
    return;
  }
  try {
    resolvedSlug = await resolveRestaurantSlugByDomain(resolution.domain);
  } catch {
    // Leave unresolved. getRestaurantSlug() falls back to the legacy
    // behavior, which then surfaces the app's normal "restaurant not
    // found" error through loadRestaurant() rather than a blank page.
    resolvedSlug = null;
  }
})();

export function getRestaurantSlug(): string {
  if (resolvedSlug) return resolvedSlug;
  const resolution = resolveTenant();
  return resolution.type === 'slug' ? resolution.slug : getRestaurantSlugFromQueryOrPath();
}

export async function loadRestaurant(slug: string): Promise<Restaurant> {
  const { data, error } = await supabase
    .from('restaurants')
    .select('id,name,slug,description,logo_url,cover_image_url,phone,email,address,status')
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error(`Restaurant "${slug}" was not found.`);

  const status = (data as Restaurant & { status?: string }).status;
  if (status === 'suspended' || status === 'inactive') {
    throw new Error('This restaurant is currently unavailable.');
  }

  return data as Restaurant;
}
