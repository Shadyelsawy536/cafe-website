import { supabase } from './supabase';

export type PaymentProvider = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  restaurant_active: boolean;
};

export async function loadPaymentProviders(restaurantId: string): Promise<PaymentProvider[]> {
  const { data, error } = await supabase
    .from('payment_providers')
    .select('id,name,slug,is_active,restaurant_payment_configs!inner(is_active,restaurant_id)')
    .eq('is_active', true)
    .eq('restaurant_payment_configs.restaurant_id', restaurantId)
    .eq('restaurant_payment_configs.is_active', true)
    .order('name');
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    is_active: row.is_active,
    restaurant_active: true,
  }));
}
