import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type OrderRealtimeEvent = {
  order_id: string;
  restaurant_id: string;
  customer_id: string | null;
  event: 'insert' | 'update' | 'delete';
  status: string | null;
  updated_at: string | null;
};

/**
 * High-scale order updates. Broadcast is preferred over Postgres Changes so
 * database authorization work is not repeated for every subscriber.
 */
export function subscribeToRestaurantOrders(
  restaurantId: string,
  onEvent: (event: OrderRealtimeEvent) => void,
): RealtimeChannel {
  return supabase
    .channel(`restaurant:${restaurantId}:orders`, { config: { private: true } })
    .on('broadcast', { event: 'order_insert' }, ({ payload }) => onEvent(payload as OrderRealtimeEvent))
    .on('broadcast', { event: 'order_update' }, ({ payload }) => onEvent(payload as OrderRealtimeEvent))
    .on('broadcast', { event: 'order_delete' }, ({ payload }) => onEvent(payload as OrderRealtimeEvent))
    .subscribe();
}

export function subscribeToCustomerOrders(
  customerId: string,
  onEvent: (event: OrderRealtimeEvent) => void,
): RealtimeChannel {
  return supabase
    .channel(`customer:${customerId}:orders`, { config: { private: true } })
    .on('broadcast', { event: 'order_insert' }, ({ payload }) => onEvent(payload as OrderRealtimeEvent))
    .on('broadcast', { event: 'order_update' }, ({ payload }) => onEvent(payload as OrderRealtimeEvent))
    .on('broadcast', { event: 'order_delete' }, ({ payload }) => onEvent(payload as OrderRealtimeEvent))
    .subscribe();
}

export async function removeOrderRealtime(channel: RealtimeChannel) {
  await supabase.removeChannel(channel);
}
