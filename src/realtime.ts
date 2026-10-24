import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';
import { supabase } from './lib/supabase';

export type OrderRealtimeEvent = {
  order_id: string;
  restaurant_id: string;
  customer_id: string | null;
  event: 'insert' | 'update' | 'delete';
  status: string;
  updated_at: string | null;
};

/** Listen directly to Postgres changes for a customer's orders. */
export function subscribeToCustomerOrders(
  customerId: string,
  onEvent: (event: OrderRealtimeEvent) => void,
): RealtimeChannel {
  return supabase
    .channel(`customer:${customerId}:orders`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `customer_id=eq.${customerId}`,
      },
      (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        const row = (payload.new || payload.old) as Record<string, unknown>;
        onEvent({
          order_id: String(row.id || ''),
          restaurant_id: String(row.restaurant_id || ''),
          customer_id: row.customer_id ? String(row.customer_id) : customerId,
          event:
            payload.eventType === 'INSERT'
              ? 'insert'
              : payload.eventType === 'DELETE'
                ? 'delete'
                : 'update',
          status: String(row.status || ''),
          updated_at: row.updated_at ? String(row.updated_at) : null,
        });
      },
    )
    .subscribe();
}

export async function removeOrderRealtime(channel: RealtimeChannel) {
  await supabase.removeChannel(channel);
}
