import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { subscribeToCustomerOrders, removeOrderRealtime, type OrderRealtimeEvent } from './lib/realtime';

const steps = [
  { key: 'pending', label: 'Order received' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'ready', label: 'Ready' },
  { key: 'out_for_delivery', label: 'Out for delivery' },
  { key: 'delivered', label: 'Delivered' },
];

function statusIndex(status: string) {
  if (status === 'cancelled' || status === 'rejected') return -1;
  return steps.findIndex(step => step.key === status);
}

export default function OrderTracking() {
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get('order');
  const [order, setOrder] = useState<{ id: string; status: string; total: number; created_at: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!orderId) { setError('No order selected.'); return; }
    let channel: ReturnType<typeof subscribeToCustomerOrders> | null = null;
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError('Please sign in to track this order.'); return; }
      const { data: customer } = await supabase.from('customers').select('id').eq('user_id', user.id).maybeSingle();
      if (!customer) { setError('Customer profile not found.'); return; }
      const { data, error: orderError } = await supabase.from('orders').select('id,status,total,created_at').eq('id', orderId).eq('customer_id', customer.id).maybeSingle();
      if (orderError || !data) { setError(orderError?.message || 'Order not found.'); return; }
      if (active) setOrder(data);
      channel = subscribeToCustomerOrders(customer.id, (event: OrderRealtimeEvent) => {
        if (event.order_id === orderId && active) {
          setOrder(current => current ? { ...current, status: event.status ?? current.status, } : current);
        }
      });
    })();
    return () => { active = false; if (channel) void removeOrderRealtime(channel); };
  }, [orderId]);

  if (error) return <div className="center-state error-state"><strong>Unable to track order</strong><span>{error}</span><a href={window.location.pathname}>Back to menu</a></div>;
  if (!order) return <div className="center-state"><div className="spinner" />Loading order…</div>;
  const current = statusIndex(order.status);
  const failed = order.status === 'cancelled' || order.status === 'rejected';

  return <div className="app"><main className="tracking-page">
    <div className="tracking-card">
      <span className="eyebrow">Live order tracking</span>
      <h1>Order #{order.id.slice(0, 8).toUpperCase()}</h1>
      <p>We’ll update this screen automatically when the restaurant changes your order.</p>
      <div className={`tracking-status ${failed ? 'failed' : ''}`}>{failed ? `Order ${order.status}` : steps[current]?.label}</div>
      {!failed && <div className="tracking-steps">{steps.map((step, index) => <div className={`tracking-step ${index <= current ? 'done' : ''}`} key={step.key}><span>{index <= current ? '✓' : index + 1}</span><b>{step.label}</b></div>)}</div>}
      <div className="tracking-total"><span>Total</span><strong>{Number(order.total).toFixed(2)}</strong></div>
      <a className="checkout" href={`${window.location.pathname}?restaurant=${params.get('restaurant') || 'cafe'}`}>Back to menu</a>
    </div>
  </main></div>;
}
