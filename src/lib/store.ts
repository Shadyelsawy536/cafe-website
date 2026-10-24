import { supabase } from './supabase';
import type { Branding, BusinessHour, Category, Location, Modifier, ModifierGroup, Product, ProductModifierGroup, Restaurant, Settings, SocialLink, WebSettings } from '../types';

export type StoreData = {
  restaurant: Restaurant;
  branding: Branding;
  webSettings: WebSettings;
  settings: Settings;
  categories: Category[];
  products: Product[];
  modifierGroups: ModifierGroup[];
  modifiers: Modifier[];
  productModifierGroups: ProductModifierGroup[];
  locations: Location[];
  socialLinks: SocialLink[];
  businessHours: BusinessHour[];
};

const STORE_CACHE_VERSION = 1;
const STORE_CACHE_FRESH_MS = 30_000;
const STORE_CACHE_MAX_STALE_MS = 5 * 60_000;
const STORE_CACHE_EVENT = 'cafe-store-cache-updated';

type StoreCacheEntry = { version: number; savedAt: number; data: StoreData };
const storeLoads = new Map<string, Promise<StoreData>>();

function cacheKey(restaurantId: string): string {
  return `cafe-store:v${STORE_CACHE_VERSION}:${restaurantId}`;
}

function readStoreCache(restaurantId: string): StoreCacheEntry | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(restaurantId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoreCacheEntry;
    if (parsed.version !== STORE_CACHE_VERSION || !parsed.savedAt || parsed.data?.restaurant?.id !== restaurantId) {
      window.localStorage.removeItem(cacheKey(restaurantId));
      return null;
    }
    return parsed;
  } catch {
    // Storage may be disabled or full. The network path remains available.
    return null;
  }
}

function writeStoreCache(data: StoreData): void {
  try {
    const entry: StoreCacheEntry = { version: STORE_CACHE_VERSION, savedAt: Date.now(), data };
    window.localStorage.setItem(cacheKey(data.restaurant.id), JSON.stringify(entry));
  } catch {
    // Caching is an optimization; quota/privacy errors must never block ordering.
  }
}

function fetchStore(restaurant: Restaurant): Promise<StoreData> {
  const existing = storeLoads.get(restaurant.id);
  if (existing) return existing;
  const request = fetchStoreFromSupabase(restaurant).finally(() => {
    if (storeLoads.get(restaurant.id) === request) storeLoads.delete(restaurant.id);
  });
  storeLoads.set(restaurant.id, request);
  return request;
}

function publishStoreUpdate(data: StoreData): void {
  try {
    window.dispatchEvent(new CustomEvent<StoreData>(STORE_CACHE_EVENT, { detail: data }));
  } catch {
    // Events are only used to refresh the current tab's UI.
  }
}

/**
 * Uses a tenant-scoped local cache for fast repeat visits.
 * Cached data contains public menu/configuration only, never customer/order/payment data.
 * Recently stale data may render immediately while a fresh copy is fetched in the background.
 */
export async function loadStore(restaurant: Restaurant): Promise<StoreData> {
  if (typeof window === 'undefined') return fetchStore(restaurant);
  const cached = readStoreCache(restaurant.id);
  const age = cached ? Date.now() - cached.savedAt : Number.POSITIVE_INFINITY;

  if (cached && age <= STORE_CACHE_FRESH_MS) {
    return cached.data;
  }

  if (cached && age <= STORE_CACHE_MAX_STALE_MS) {
    void fetchStore(restaurant).then(fresh => {
      writeStoreCache(fresh);
      publishStoreUpdate(fresh);
    }).catch(() => {
      // Keep showing the last known menu; a later visit retries the refresh.
    });
    return cached.data;
  }

  const fresh = await fetchStore(restaurant);
  writeStoreCache(fresh);
  return fresh;
}

export function subscribeToStoreCacheUpdates(listener: (data: StoreData) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = (event: Event) => {
    const data = (event as CustomEvent<StoreData>).detail;
    if (data?.restaurant?.id) listener(data);
  };
  window.addEventListener(STORE_CACHE_EVENT, handler);
  return () => window.removeEventListener(STORE_CACHE_EVENT, handler);
}

async function fetchStoreFromSupabase(restaurant: Restaurant): Promise<StoreData> {
  const id = restaurant.id;
  const [branding, webSettings, settings, categories, products, modifierGroups, modifiers, productModifierGroups, locations, socialLinks, businessHours] = await Promise.all([
    supabase.from('restaurant_branding').select('customer_primary_color,customer_secondary_color,customer_background_color,customer_logo_url,customer_cover_url,font_family').eq('restaurant_id', id).maybeSingle(),
    supabase.from('restaurant_web_settings').select('website_name,seo_title,seo_description,favicon_url,og_image_url,theme_color,pwa_enabled,pwa_short_name').eq('restaurant_id', id).maybeSingle(),
    supabase.from('restaurant_settings').select('currency,timezone,min_order_amount,tax_rate,accepts_delivery,accepts_pickup,preparation_time_minutes,accepts_scheduled_orders,scheduled_order_max_days,customer_notes_enabled,operational_status,closure_message').eq('restaurant_id', id).maybeSingle(),
    supabase.from('categories').select('id,name,sort_order').eq('restaurant_id', id).is('deleted_at', null).order('sort_order'),
    supabase.from('products').select('id,category_id,name,description,base_price,image_url,status,featured,best_seller,sort_order').eq('restaurant_id', id).is('deleted_at', null).order('sort_order'),
    supabase.from('modifier_groups').select('id,name,min_select,max_select,required').eq('restaurant_id', id).order('name'),
    // modifiers has no restaurant_id column -- unlike every other query here, this one
    // used to have no tenant filter at all and pulled every restaurant's modifiers to
    // the browser. Scope it through the parent modifier_groups row instead.
    supabase.from('modifiers').select('id,modifier_group_id,name,price,image_url,sort_order,modifier_groups!inner(restaurant_id)').eq('modifier_groups.restaurant_id', id).order('sort_order'),
    supabase.from('product_modifier_groups').select('product_id,modifier_group_id'),
    supabase.from('restaurant_locations').select('id,name,address,map_url,latitude,longitude,is_primary').eq('restaurant_id', id).eq('is_active', true).order('sort_order'),
    supabase.from('restaurant_social_links').select('platform,label,url,sort_order').eq('restaurant_id', id).eq('is_active', true).order('sort_order'),
    supabase.from('restaurant_business_hours').select('day_of_week,is_closed,open_time,close_time').eq('restaurant_id', id).order('day_of_week'),
  ]);

  for (const result of [branding, webSettings, settings, categories, products, modifierGroups, modifiers, productModifierGroups, locations, socialLinks, businessHours]) {
    if (result.error) throw result.error;
  }

  const fallbackBranding: Branding = {
    customer_primary_color: '#111111', customer_secondary_color: '#ffffff', customer_background_color: '#f8f7f4',
    customer_logo_url: restaurant.logo_url, customer_cover_url: restaurant.cover_image_url, font_family: null,
  };
  const fallbackWebSettings: WebSettings = {
    website_name: restaurant.name, seo_title: restaurant.name, seo_description: restaurant.description,
    favicon_url: restaurant.logo_url, og_image_url: restaurant.cover_image_url, theme_color: '#111111',
    pwa_enabled: true, pwa_short_name: restaurant.name,
  };
  const fallbackSettings: Settings = {
    currency: 'EGP', timezone: 'Africa/Cairo', min_order_amount: 0, tax_rate: 0, accepts_delivery: true, accepts_pickup: true,
    preparation_time_minutes: 20, accepts_scheduled_orders: false, scheduled_order_max_days: 7, customer_notes_enabled: true,
    operational_status: 'open', closure_message: null,
  };

  return {
    restaurant,
    branding: { ...fallbackBranding, ...(branding.data ?? {}), customer_logo_url: restaurant.logo_url, customer_cover_url: restaurant.cover_image_url },
    webSettings: { ...fallbackWebSettings, ...(webSettings.data ?? {}) },
    settings: { ...fallbackSettings, ...(settings.data ?? {}) },
    categories: (categories.data ?? []) as Category[],
    products: ((products.data ?? []) as Product[]).filter(p => !['inactive', 'unavailable', 'archived'].includes(String(p.status).toLowerCase())),
    modifierGroups: (modifierGroups.data ?? []) as ModifierGroup[],
    modifiers: (modifiers.data ?? []) as Modifier[],
    productModifierGroups: (productModifierGroups.data ?? []) as ProductModifierGroup[],
    locations: (locations.data ?? []) as Location[],
    socialLinks: (socialLinks.data ?? []) as SocialLink[],
    businessHours: (businessHours.data ?? []) as BusinessHour[],
  };
}
