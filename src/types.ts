export type Restaurant = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
};

export type Branding = {
  customer_primary_color: string | null;
  customer_secondary_color: string | null;
  customer_background_color: string | null;
  customer_logo_url: string | null;
  customer_cover_url: string | null;
  font_family: string | null;
};

export type Settings = {
  currency: string;
  timezone: string;
  min_order_amount: number;
  tax_rate: number;
  accepts_delivery: boolean;
  accepts_pickup: boolean;
  preparation_time_minutes: number;
  accepts_scheduled_orders: boolean;
  scheduled_order_max_days: number;
  customer_notes_enabled: boolean;
  operational_status: 'open' | 'closed' | 'temporarily_closed' | string;
  closure_message: string | null;
};

export type Category = { id: string; name: string; sort_order: number };
export type Product = {
  id: string; category_id: string | null; name: string; description: string | null;
  base_price: number; image_url: string | null; status: string; featured: boolean; best_seller: boolean; sort_order: number;
};
export type Modifier = { id: string; modifier_group_id: string; name: string; price: number; image_url: string | null; sort_order: number };
export type ModifierGroup = { id: string; name: string; min_select: number; max_select: number; required: boolean };
export type ProductModifierGroup = { product_id: string; modifier_group_id: string };
export type Location = { id: string; name: string; address: string | null; map_url: string | null; latitude: number | null; longitude: number | null; is_primary: boolean };
export type SocialLink = { platform: string; label: string | null; url: string; sort_order: number };
export type BusinessHour = { day_of_week: number; is_closed: boolean; open_time: string | null; close_time: string | null };
