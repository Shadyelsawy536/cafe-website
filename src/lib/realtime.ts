import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type OrderRealtimeEvent = {
  order_id: string;
  restaurant_id: string;
  customer_id: string | null;
  event: 'insert' | 'update' | 'delete';
  status: string;
  updated_at: string | null;
};

type OrderRow = Record<string, unknown>;

function toOrderEvent(payload: RealtimePostgresChangesPayload<OrderRow>): OrderRealtimeEvent | null {
  const row = payload.new && Object.keys(payload.new).length ? payload.new : payload.old;
  const current = row as OrderRow;
  const orderId = String(current?.id ?? '');
  if (!orderId) return null;

  return {
    order_id: orderId,
    restaurant_id: String(current.restaurant_id ?? ''),
    customer_id: current.customer_id ? String(current.customer_id) : null,
    event: payload.eventType.toLowerCase() as OrderRealtimeEvent['event'],
    status: String(current.status ?? ''),
    updated_at: current.updated_at ? String(current.updated_at) : null,
  };
}

/**
 * Listen to the customer's orders. When the customer is viewing a tracking URL
 * (?order=<uuid>), narrow the Realtime filter to that exact order so the
 * tracking screen receives only the order it is displaying.
 */
export function subscribeToCustomerOrders(
  customerId: string,
  onEvent: (event: OrderRealtimeEvent) => void,
): RealtimeChannel {
  const trackingOrderId = new URLSearchParams(window.location.search).get('order');
  const filter = trackingOrderId
    ? `id=eq.${trackingOrderId}`
    : `customer_id=eq.${customerId}`;
  const channelName = trackingOrderId
    ? `order:${trackingOrderId}`
    : `customer:${customerId}:orders`;

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter,
      },
      (payload: RealtimePostgresChangesPayload<OrderRow>) => {
        const event = toOrderEvent(payload);
        if (event) onEvent(event);
      },
    )
    .subscribe((status, error) => {
      if (status !== 'SUBSCRIBED') {
        console.warn('[orders realtime] subscription status:', status, error ?? '');
      }
      if (error) {
        console.error('[orders realtime] channel error:', error);
      }
    });

  return channel;
}

/** Direct subscription for a single order. */
export function subscribeToOrder(
  orderId: string,
  onEvent: (event: OrderRealtimeEvent) => void,
): RealtimeChannel {
  return supabase
    .channel(`order:${orderId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `id=eq.${orderId}`,
      },
      (payload: RealtimePostgresChangesPayload<OrderRow>) => {
        const event = toOrderEvent(payload);
        if (event) onEvent(event);
      },
    )
    .subscribe((status, error) => {
      if (status !== 'SUBSCRIBED') {
        console.warn('[order realtime] subscription status:', status, error ?? '');
      }
      if (error) {
        console.error('[order realtime] channel error:', error);
      }
    });
}

/** Kept for compatibility with dashboard/customer order views. */
export function subscribeToRestaurantOrders(
  restaurantId: string,
  onEvent: (event: OrderRealtimeEvent) => void,
): RealtimeChannel {
  return supabase
    .channel(`restaurant:${restaurantId}:orders`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `restaurant_id=eq.${restaurantId}`,
      },
      (payload: RealtimePostgresChangesPayload<OrderRow>) => {
        const event = toOrderEvent(payload);
        if (event) onEvent(event);
      },
    )
    .subscribe((status, error) => {
      if (status !== 'SUBSCRIBED') {
        console.warn('[restaurant orders realtime] subscription status:', status, error ?? '');
      }
      if (error) {
        console.error('[restaurant orders realtime] channel error:', error);
      }
    });
}

export async function removeOrderRealtime(channel: RealtimeChannel) {
  await supabase.removeChannel(channel);
}
