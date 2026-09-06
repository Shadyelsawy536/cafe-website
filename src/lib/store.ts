import { supabase } from './supabase';
import type { Branding, BusinessHour, Category, Location, Modifier, ModifierGroup, Product, ProductModifierGroup, Restaurant, Settings, SocialLink } from '../types';

export type StoreData = {
  restaurant: Restaurant;
  branding: Branding;
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

export async function loadStore(restaurant: Restaurant): Promise<StoreData> {
  const id = restaurant.id;
  const [branding, settings, categories, products, modifierGroups, modifiers, productModifierGroups, locations, socialLinks, businessHours] = await Promise.all([
    supabase.from('restaurant_branding').select('customer_primary_color,customer_secondary_color,customer_background_color,customer_logo_url,customer_cover_url,font_family').eq('restaurant_id', id).maybeSingle(),
    supabase.from('restaurant_settings').select('currency,timezone,min_order_amount,tax_rate,accepts_delivery,accepts_pickup,preparation_time_minutes,accepts_scheduled_orders,scheduled_order_max_days,customer_notes_enabled,operational_status,closure_message').eq('restaurant_id', id).maybeSingle(),
    supabase.from('categories').select('id,name,sort_order').eq('restaurant_id', id).is('deleted_at', null).order('sort_order'),
    supabase.from('products').select('id,category_id,name,description,base_price,image_url,status,featured,best_seller,sort_order').eq('restaurant_id', id).is('deleted_at', null).order('sort_order'),
    supabase.from('modifier_groups').select('id,name,min_select,max_select,required').eq('restaurant_id', id).order('name'),
    supabase.from('modifiers').select('id,modifier_group_id,name,price,image_url,sort_order').order('sort_order'),
    supabase.from('product_modifier_groups').select('product_id,modifier_group_id'),
    supabase.from('restaurant_locations').select('id,name,address,map_url,latitude,longitude,is_primary').eq('restaurant_id', id).eq('is_active', true).order('sort_order'),
    supabase.from('restaurant_social_links').select('platform,label,url,sort_order').eq('restaurant_id', id).eq('is_active', true).order('sort_order'),
    supabase.from('restaurant_business_hours').select('day_of_week,is_closed,open_time,close_time').eq('restaurant_id', id).order('day_of_week'),
  ]);

  for (const result of [branding, settings, categories, products, modifierGroups, modifiers, productModifierGroups, locations, socialLinks, businessHours]) {
    if (result.error) throw result.error;
  }

  const fallbackBranding: Branding = {
    customer_primary_color: '#111111', customer_secondary_color: '#ffffff', customer_background_color: '#f8f7f4',
    customer_logo_url: restaurant.logo_url, customer_cover_url: restaurant.cover_image_url, font_family: null,
  };
  const fallbackSettings: Settings = {
    currency: 'EGP', timezone: 'Africa/Cairo', min_order_amount: 0, tax_rate: 0, accepts_delivery: true, accepts_pickup: true,
    preparation_time_minutes: 20, accepts_scheduled_orders: false, scheduled_order_max_days: 7, customer_notes_enabled: true,
    operational_status: 'open', closure_message: null,
  };

  return {
    restaurant,
    branding: { ...fallbackBranding, ...(branding.data ?? {}) },
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
