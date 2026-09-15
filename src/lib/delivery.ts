import { supabase } from './supabase';

export type DeliveryZoneMatch = {
  id: string;
  name: string;
  delivery_fee: number;
  min_order_amount: number;
};

export async function findDeliveryZone(latitude: number, longitude: number): Promise<DeliveryZoneMatch | null> {
  const { data, error } = await supabase.rpc('find_delivery_zone', {
    p_latitude: latitude,
    p_longitude: longitude,
  });
  if (error) throw error;
  return (data?.[0] ?? null) as DeliveryZoneMatch | null;
}
