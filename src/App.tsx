import { FormEvent, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { supabase } from './lib/supabase';
import { getRestaurantSlug, loadRestaurant } from './lib/tenant';
import { loadStore, type StoreData } from './lib/store';
import { findDeliveryZone } from './lib/delivery';
import { removeOrderRealtime, subscribeToCustomerOrders, type OrderRealtimeEvent } from './lib/realtime';
import type { Modifier, ModifierGroup, Product } from './types';

const money = (value: number, currency: string) => new Intl.NumberFormat('en-EG', { style: 'currency', currency }).format(value);
type CartItem = { product: Product; quantity: number; modifierIds: string[]; modifierTotal: number };
type Customer = { id: string; user_id: string; full_name: string; phone: string };
type PaymentOption = { id: string; name: string; slug: string };
type Zone = { id: string; name: string; delivery_fee: number; min_order_amount: number };

type TrackingOrder = { id: string; status: string; total: number; created_at: string; updated_at: string; scheduled_for: string | null; delivery_type: string; delivery_address: string | null; pickup_branch: string | null; payment_method: string };

const statusLabel: Record<string, string> = { pending: 'Pending', confirmed: 'Confirmed', preparing: 'Preparing', ready: 'Ready', out_for_delivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled', rejected: 'Rejected' };
const statusSteps = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered'];

export default function App() {
  const [store, setStore] = useState<StoreData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [notice, setNotice] = useState('');
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('order'));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const slug = getRestaurantSlug();
        if (!slug) throw new Error('No restaurant selected. Use ?restaurant=cafe for testing.');
        const restaurant = await loadRestaurant(slug);
        const data = await loadStore(restaurant);
        if (!cancelled) setStore(data);
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : 'Unable to load restaurant.'); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!store) return;
    let active = true;
    const loadCustomer = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !active) return;
      const { data } = await supabase.from('customers').select('id,user_id,full_name,phone').eq('user_id', user.id).eq('restaurant_id', store.restaurant.id).maybeSingle();
      if (active) setCustomer(data as Customer | null);
    };
    loadCustomer();
    const { data } = supabase.auth.onAuthStateChange(() => { void loadCustomer(); });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [store]);

  useEffect(() => {
    if (!customer) return;
    const channel = subscribeToCustomerOrders(customer.id, event => {
      if (event.order_id === trackingOrderId && event.status) setNotice(`Order updated: ${statusLabel[event.status] ?? event.status}`);
    });
    return () => { void removeOrderRealtime(channel); };
  }, [customer, trackingOrderId]);

  const products = useMemo(() => {
    if (!store) return [];
    const q = query.trim().toLowerCase();
    return store.products.filter(p => (activeCategory === 'all' || p.category_id === activeCategory) && (!q || `${p.name} ${p.description ?? ''}`.toLowerCase().includes(q)));
  }, [store, activeCategory, query]);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartSubtotal = cart.reduce((sum, item) => sum + item.quantity * (Number(item.product.base_price) + item.modifierTotal), 0);
  const tax = store ? Math.round(cartSubtotal * Number(store.settings.tax_rate || 0) * 100) / 100 : 0;

  const groupsForProduct = (product: Product) => {
    if (!store) return [];
    const ids = store.productModifierGroups.filter(x => x.product_id === product.id).map(x => x.modifier_group_id);
    return store.modifierGroups.filter(g => ids.includes(g.id));
  };
  const modifiersForGroup = (group: ModifierGroup) => store?.modifiers.filter(m => m.modifier_group_id === group.id).sort((a, b) => a.sort_order - b.sort_order) ?? [];
  const addConfiguredItem = (product: Product, modifierIds: string[]) => {
    const modifierTotal = modifierIds.reduce((sum, id) => sum + Number(store?.modifiers.find(m => m.id === id)?.price ?? 0), 0);
    setCart(current => {
      const key = modifierIds.slice().sort().join(',');
      const same = current.find(x => x.product.id === product.id && x.modifierIds.slice().sort().join(',') === key);
      if (same) return current.map(x => x === same ? { ...x, quantity: x.quantity + 1 } : x);
      return [...current, { product, quantity: 1, modifierIds, modifierTotal }];
    });
    setSelected(null);
  };
  const addSimple = (product: Product) => groupsForProduct(product).length ? setSelected(product) : addConfiguredItem(product, []);
  const startCheckout = () => { if (!cart.length || !store) return; if (!customer) { setAuthOpen(true); return; } setCheckoutOpen(true); };
  const signOut = async () => { await supabase.auth.signOut(); setCustomer(null); };

  if (loading) return <div className="center-state"><div className="spinner" />Loading restaurant…</div>;
  if (error || !store) return <div className="center-state error-state"><strong>Unable to load this restaurant</strong><span>{error}</span></div>;
  const { restaurant, branding, settings } = store;
  const closed = settings.operational_status !== 'open';

  return <div className="app" style={{ '--primary': branding.customer_primary_color || '#111', '--secondary': branding.customer_secondary_color || '#fff', '--background': branding.customer_background_color || '#f8f7f4' } as CSSProperties}>
    <header className="header"><div className="header-inner"><a className="brand" href={`?restaurant=${restaurant.slug}`}>{branding.customer_logo_url ? <img src={branding.customer_logo_url} alt={restaurant.name} /> : <span className="logo-fallback">{restaurant.name.charAt(0)}</span>}<span>{restaurant.name}</span></a><div className="header-actions"><a href="#about">About</a><a href="#locations">Locations</a>{customer ? <button className="account-link" onClick={signOut}>Sign out</button> : <button className="account-link" onClick={() => setAuthOpen(true)}>Sign in</button>}<button className="cart-button" onClick={() => document.getElementById('cart')?.scrollIntoView({ behavior: 'smooth' })}>Cart <b>{cartCount}</b></button></div></div></header>
    <main>
      <section className="hero" style={branding.customer_cover_url ? { backgroundImage: `linear-gradient(90deg, rgba(0,0,0,.68), rgba(0,0,0,.2)), url(${branding.customer_cover_url})` } : undefined}><div className="hero-content"><span className="eyebrow">Welcome</span><h1>{restaurant.name}</h1><p>{restaurant.description || 'Freshly prepared favorites, made for your day.'}</p><div className="hero-meta"><span>⏱ {settings.preparation_time_minutes} min prep</span>{settings.accepts_delivery && <span>Delivery available</span>}{settings.accepts_pickup && <span>Pickup available</span>}</div></div></section>
      {closed && <div className="notice"><strong>{settings.operational_status === 'temporarily_closed' ? 'Temporarily closed' : 'Currently closed'}</strong><span>{settings.closure_message || 'Online ordering is currently unavailable.'}</span></div>}
      <section className="menu-section"><div className="section-heading"><div><span className="eyebrow">Our menu</span><h2>Choose your favorite</h2></div><input className="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search menu…" /></div><div className="category-bar"><button className={activeCategory === 'all' ? 'active' : ''} onClick={() => setActiveCategory('all')}>All</button>{store.categories.map(c => <button key={c.id} className={activeCategory === c.id ? 'active' : ''} onClick={() => setActiveCategory(c.id)}>{c.name}</button>)}</div><div className="product-grid">{products.map(product => <article className="product-card" key={product.id} onClick={() => setSelected(product)}><div className="product-image">{product.image_url ? <img src={product.image_url} alt="" loading="lazy" /> : <span>{product.name.charAt(0)}</span>}{product.best_seller && <span className="badge">Best seller</span>}</div><div className="product-body"><div><h3>{product.name}</h3><p>{product.description || 'Prepared fresh to order.'}</p></div><div className="product-footer"><strong>{money(Number(product.base_price), settings.currency)}</strong><button onClick={e => { e.stopPropagation(); addSimple(product); }}>+ Add</button></div></div></article>)}</div>{!products.length && <div className="empty">No products found.</div>}</section>
      <section id="cart" className="cart-section"><div className="section-heading"><div><span className="eyebrow">Your order</span><h2>Cart</h2></div></div>{cart.length === 0 ? <div className="empty">Your cart is empty. Add something delicious from the menu.</div> : <div className="cart-card">{cart.map((item, index) => <div className="cart-row" key={`${item.product.id}-${item.modifierIds.join('-')}-${index}`}><div><strong>{item.product.name}</strong>{item.modifierIds.length > 0 && <span>{item.modifierIds.map(id => store.modifiers.find(m => m.id === id)?.name).filter(Boolean).join(', ')}</span>}<span>{money(Number(item.product.base_price) + item.modifierTotal, settings.currency)} each</span></div><div className="qty"><button onClick={() => setCart(c => c.map((x, i) => i === index ? { ...x, quantity: Math.max(0, x.quantity - 1) } : x).filter(x => x.quantity))}>−</button><b>{item.quantity}</b><button onClick={() => setCart(c => c.map((x, i) => i === index ? { ...x, quantity: x.quantity + 1 } : x))}>+</button></div></div>)}<div className="cart-total"><span>Subtotal</span><strong>{money(cartSubtotal, settings.currency)}</strong></div>{tax > 0 && <div className="cart-total"><span>Tax</span><strong>{money(tax, settings.currency)}</strong></div>}<div className="cart-total grand"><span>Total</span><strong>{money(cartSubtotal + tax, settings.currency)}</strong></div><button className="checkout" disabled={closed || cartSubtotal < Number(settings.min_order_amount)} onClick={startCheckout}>{closed ? 'Ordering unavailable' : cartSubtotal < Number(settings.min_order_amount) ? `Minimum order ${money(Number(settings.min_order_amount), settings.currency)}` : 'Continue to checkout'}</button></div>}</section>
      <section id="about" className="info-section"><div><span className="eyebrow">About</span><h2>{restaurant.name}</h2><p>{restaurant.description || 'We look forward to serving you.'}</p></div><div><span className="eyebrow">Contact</span><p>{restaurant.phone || 'Phone not provided'}</p><p>{restaurant.email || 'Email not provided'}</p><p>{restaurant.address || 'Address not provided'}</p></div></section>
      <section id="locations" className="locations"><div className="section-heading"><div><span className="eyebrow">Find us</span><h2>Locations</h2></div></div><div className="location-grid">{store.locations.map(location => <div className="location-card" key={location.id}><h3>{location.name}{location.is_primary && <span className="primary-dot">Primary</span>}</h3><p>{location.address || restaurant.address || 'Address not provided'}</p>{location.map_url && <a href={location.map_url} target="_blank" rel="noreferrer">Open map ↗</a>}</div>)}</div></section>
    </main><footer><span>© {new Date().getFullYear()} {restaurant.name}</span><div>{store.socialLinks.map(link => <a key={link.platform} href={link.url} target="_blank" rel="noreferrer">{link.label || link.platform}</a>)}</div></footer>
    {selected && <ProductModal product={selected} groups={groupsForProduct(selected)} modifiersForGroup={modifiersForGroup} currency={settings.currency} onClose={() => setSelected(null)} onAdd={addConfiguredItem} />}
    {authOpen && <AuthModal restaurantId={restaurant.id} onClose={() => setAuthOpen(false)} onCustomer={c => { setCustomer(c); setAuthOpen(false); setCheckoutOpen(true); }} />}
    {checkoutOpen && customer && <CheckoutModal store={store} customer={customer} cart={cart} subtotal={cartSubtotal} tax={tax} onClose={() => setCheckoutOpen(false)} onSuccess={id => { setCart([]); setCheckoutOpen(false); setTrackingOrderId(id); window.history.replaceState({}, '', `${window.location.pathname}?restaurant=${restaurant.slug}&order=${id}`); }} setNotice={setNotice} />}
    {trackingOrderId && customer && <TrackingModal orderId={trackingOrderId} currency={settings.currency} customerId={customer.id} onClose={() => setTrackingOrderId(null)} />}
    {notice && <div className="toast" onClick={() => setNotice('')}>{notice}</div>}
  </div>;
}

function ProductModal({ product, groups, modifiersForGroup, currency, onClose, onAdd }: { product: Product; groups: ModifierGroup[]; modifiersForGroup: (g: ModifierGroup) => Modifier[]; currency: string; onClose: () => void; onAdd: (p: Product, ids: string[]) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const valid = groups.every(g => { const count = selected.filter(id => modifiersForGroup(g).some(m => m.id === id)).length; return count >= Number(g.min_select || 0) && count <= Number(g.max_select || 999); });
  const toggle = (group: ModifierGroup, modifier: Modifier) => setSelected(current => { const inGroup = current.filter(id => modifiersForGroup(group).some(m => m.id === id)); if (inGroup.includes(modifier.id)) return current.filter(id => id !== modifier.id); if (inGroup.length >= Number(group.max_select || 999)) return [...current.filter(id => !inGroup.includes(id)), ...inGroup.slice(1), modifier.id]; return [...current, modifier.id]; });
  return <div className="modal-backdrop" onClick={onClose}><div className="modal product-modal" onClick={e => e.stopPropagation()}>{product.image_url && <img src={product.image_url} alt="" />}<div className="modal-content"><button className="close" onClick={onClose}>×</button><span className="eyebrow">Customize</span><h2>{product.name}</h2><p>{product.description}</p><strong className="modal-price">{money(Number(product.base_price), currency)}</strong>{groups.map(group => <div className="modifier-group" key={group.id}><div><h3>{group.name}</h3><small>{group.required || Number(group.min_select) > 0 ? 'Required' : 'Optional'} · choose up to {group.max_select}</small></div>{modifiersForGroup(group).map(mod => <label className="modifier-option" key={mod.id}><input type="checkbox" checked={selected.includes(mod.id)} onChange={() => toggle(group, mod)} /><span>{mod.name}</span><b>{Number(mod.price) ? `+ ${money(Number(mod.price), currency)}` : 'Included'}</b></label>)}</div>)}<button className="checkout" disabled={!valid} onClick={() => onAdd(product, selected)}>Add to cart</button></div></div></div>;
}

function AuthModal({ restaurantId, onClose, onCustomer }: { restaurantId: string; onClose: () => void; onCustomer: (c: Customer) => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin'); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async (e: FormEvent) => { e.preventDefault(); setBusy(true); setError(''); try { let userId: string | undefined; if (mode === 'signup') { const { data, error: signError } = await supabase.auth.signUp({ email, password }); if (signError) throw signError; userId = data.user?.id; if (!userId) throw new Error('Check your email to confirm the account, then sign in.'); const { error: insertError } = await supabase.from('customers').insert({ restaurant_id: restaurantId, user_id: userId, full_name: name.trim(), phone: phone.trim() }); if (insertError) throw insertError; } else { const { data, error: signError } = await supabase.auth.signInWithPassword({ email, password }); if (signError) throw signError; userId = data.user?.id; } if (!userId) throw new Error('Authentication failed.'); const { data: customer, error: customerError } = await supabase.from('customers').select('id,user_id,full_name,phone').eq('restaurant_id', restaurantId).eq('user_id', userId).maybeSingle(); if (customerError || !customer) throw customerError ?? new Error('Customer profile not found.'); onCustomer(customer as Customer); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to sign in.'); } finally { setBusy(false); } };
  return <div className="modal-backdrop" onClick={onClose}><div className="modal auth-modal" onClick={e => e.stopPropagation()}><div className="modal-content"><button className="close" onClick={onClose}>×</button><span className="eyebrow">Account</span><h2>{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h2><form onSubmit={submit}>{mode === 'signup' && <><input required value={name} onChange={e => setName(e.target.value)} placeholder="Full name" /><input required value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone" /></>}<input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" /><input required minLength={6} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" />{error && <div className="form-error">{error}</div>}<button className="checkout" disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}</button></form><button className="text-button" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>{mode === 'signin' ? 'Create an account' : 'Already have an account? Sign in'}</button></div></div></div>;
}

function CheckoutModal({ store, customer, cart, subtotal, tax, onClose, onSuccess, setNotice }: { store: StoreData; customer: Customer; cart: CartItem[]; subtotal: number; tax: number; onClose: () => void; onSuccess: (orderId: string) => void; setNotice: (message: string) => void }) {
  const { restaurant, settings } = store;
  const [deliveryType, setDeliveryType] = useState<'delivery' | 'pickup'>(settings.accepts_delivery ? 'delivery' : 'pickup');
  const [address, setAddress] = useState(''); const [pickup, setPickup] = useState(store.locations.find(x => x.is_primary)?.name || store.locations[0]?.name || '');
  const [payment, setPayment] = useState('cash'); const [providers, setProviders] = useState<PaymentOption[]>([]); const [notes, setNotes] = useState(''); const [scheduled, setScheduled] = useState(false); const [scheduledFor, setScheduledFor] = useState('');
  const [zone, setZone] = useState<Zone | null>(null); const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');

  useEffect(() => { let active = true; (async () => { const { data } = await supabase.from('payment_providers').select('id,name,slug').eq('is_active', true).order('name'); const configured = data ?? []; if (active) { setProviders(configured as PaymentOption[]); if (configured.length && !configured.some(x => x.slug === payment)) setPayment(configured[0].slug); } })(); return () => { active = false; }; }, [restaurant.id]);

  const locate = () => { if (!navigator.geolocation) { setError('Location is not supported by this browser.'); return; } setError(''); navigator.geolocation.getCurrentPosition(async position => { try { const c = { latitude: position.coords.latitude, longitude: position.coords.longitude }; const result = await findDeliveryZone(c.latitude, c.longitude); if (!result) throw new Error('Delivery is not available at this location.'); setCoords(c); setZone(result as Zone); } catch (e) { setCoords(null); setZone(null); setError(e instanceof Error ? e.message : 'Unable to find a delivery zone.'); } }, () => setError('Please allow location access so we can calculate delivery availability and fee.')); };
  const deliveryFee = deliveryType === 'delivery' ? Number(zone?.delivery_fee || 0) : 0;
  const total = subtotal + tax + deliveryFee;
  const minDate = new Date(Date.now() + Number(settings.preparation_time_minutes) * 60000); const maxDate = new Date(Date.now() + Number(settings.scheduled_order_max_days) * 86400000);
  const toLocalInput = (d: Date) => { const pad = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  const submit = async (e: FormEvent) => { e.preventDefault(); setBusy(true); setError(''); try {
    if (deliveryType === 'delivery' && (!coords || !zone)) throw new Error('Select your delivery location first.');
    if (deliveryType === 'delivery' && !address.trim()) throw new Error('Delivery address is required.');
    if (deliveryType === 'pickup' && !pickup.trim()) throw new Error('Select a pickup branch.');
    if (scheduled && !settings.accepts_scheduled_orders) throw new Error('Scheduled orders are currently disabled.');
    const scheduledIso = scheduled && scheduledFor ? new Date(scheduledFor).toISOString() : null;
    if (scheduled && !scheduledIso) throw new Error('Choose a scheduled time.');
    const items = cart.map(item => ({ product_id: item.product.id, quantity: item.quantity, modifier_ids: item.modifierIds }));
    const { data, error: orderError } = await supabase.rpc('place_order_with_location', { p_restaurant_id: restaurant.id, p_customer_id: customer.id, p_customer_name: customer.full_name, p_customer_phone: customer.phone, p_delivery_type: deliveryType, p_delivery_address: deliveryType === 'delivery' ? `${address.trim()}${zone ? ` (${zone.name})` : ''}` : null, p_pickup_branch: deliveryType === 'pickup' ? pickup : null, p_payment_method: payment, p_items: items, p_coupon_code: null, p_customer_notes: settings.customer_notes_enabled ? notes.trim() : '', p_scheduled_for: scheduledIso, p_latitude: coords?.latitude ?? null, p_longitude: coords?.longitude ?? null });
    if (orderError) throw orderError; if (!data) throw new Error('Order was not created.'); setNotice('Order placed successfully.'); onSuccess(String(data));
  } catch (e) { setError(e instanceof Error ? e.message : 'Unable to place order.'); } finally { setBusy(false); }
  };

  return <div className="modal-backdrop" onClick={onClose}><div className="modal checkout-modal" onClick={e => e.stopPropagation()}><div className="modal-content"><button className="close" onClick={onClose}>×</button><span className="eyebrow">Checkout</span><h2>Complete your order</h2><form onSubmit={submit}><div className="choice-row">{settings.accepts_delivery && <button type="button" className={deliveryType === 'delivery' ? 'choice active' : 'choice'} onClick={() => setDeliveryType('delivery')}>Delivery</button>}{settings.accepts_pickup && <button type="button" className={deliveryType === 'pickup' ? 'choice active' : 'choice'} onClick={() => setDeliveryType('pickup')}>Pickup</button>}</div>{deliveryType === 'delivery' ? <><input required value={address} onChange={e => setAddress(e.target.value)} placeholder="Delivery address" /><button type="button" className="secondary-button" onClick={locate}>{zone ? `📍 ${zone.name} · ${money(deliveryFee, settings.currency)}` : '📍 Detect delivery zone'}</button>{zone && subtotal < Number(zone.min_order_amount) && <div className="form-error">This zone requires a minimum order of {money(Number(zone.min_order_amount), settings.currency)}.</div>}</> : <select value={pickup} onChange={e => setPickup(e.target.value)} required>{store.locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}</select>}<div><label>Payment</label>{providers.length ? <div className="choice-row">{providers.map(p => <button type="button" key={p.id} className={payment === p.slug ? 'choice active' : 'choice'} onClick={() => setPayment(p.slug)}>{p.name}</button>)}</div> : <div className="payment-fallback">Cash on {deliveryType === 'delivery' ? 'delivery' : 'pickup'}</div>}</div>{settings.accepts_scheduled_orders && <label className="check-row"><input type="checkbox" checked={scheduled} onChange={e => setScheduled(e.target.checked)} /> Schedule this order</label>}{scheduled && <input type="datetime-local" required value={scheduledFor} min={toLocalInput(minDate)} max={toLocalInput(maxDate)} onChange={e => setScheduledFor(e.target.value)} />}{settings.customer_notes_enabled && <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Order notes (optional)" rows={3} />}{error && <div className="form-error">{error}</div>}<div className="cart-total"><span>Subtotal</span><strong>{money(subtotal, settings.currency)}</strong></div>{tax > 0 && <div className="cart-total"><span>Tax</span><strong>{money(tax, settings.currency)}</strong></div>}{deliveryType === 'delivery' && <div className="cart-total"><span>Delivery</span><strong>{zone ? money(deliveryFee, settings.currency) : '—'}</strong></div>}<div className="cart-total grand"><span>Total</span><strong>{money(total, settings.currency)}</strong></div><button className="checkout" disabled={busy || (deliveryType === 'delivery' && (!zone || subtotal < Number(zone?.min_order_amount || 0)))}>{busy ? 'Placing order…' : 'Place order'}</button></form></div></div></div>;
}

function TrackingModal({ orderId, currency, customerId, onClose }: { orderId: string; currency: string; customerId: string; onClose: () => void }) {
  const [order, setOrder] = useState<TrackingOrder | null>(null); const [error, setError] = useState('');
  useEffect(() => { let active = true; (async () => { const { data, error: e } = await supabase.from('orders').select('id,status,total,created_at,updated_at,scheduled_for,delivery_type,delivery_address,pickup_branch,payment_method').eq('id', orderId).eq('customer_id', customerId).maybeSingle(); if (!active) return; if (e) setError(e.message); else setOrder(data as TrackingOrder | null); })(); const channel = subscribeToCustomerOrders(customerId, event => { if (event.order_id === orderId && event.status) setOrder(current => current ? { ...current, status: event.status, updated_at: event.updated_at || current.updated_at } : current); }); return () => { active = false; void removeOrderRealtime(channel); }; }, [orderId, customerId]);
  const currentIndex = order ? statusSteps.indexOf(order.status) : -1;
  return <div className="modal-backdrop" onClick={onClose}><div className="modal tracking-modal" onClick={e => e.stopPropagation()}><div className="modal-content"><button className="close" onClick={onClose}>×</button><span className="eyebrow">Live order</span><h2>{order ? statusLabel[order.status] ?? order.status : 'Loading order…'}</h2>{error && <div className="form-error">{error}</div>}{order && <><div className="tracking-steps">{statusSteps.map((step, i) => <div className={i <= currentIndex ? 'tracking-step active' : 'tracking-step'} key={step}><span>{i + 1}</span><small>{statusLabel[step]}</small></div>)}</div>{['cancelled', 'rejected'].includes(order.status) && <div className="notice">This order is {statusLabel[order.status].toLowerCase()}.</div>}<div className="cart-total"><span>Total</span><strong>{money(Number(order.total), currency)}</strong></div><p>{order.delivery_type === 'delivery' ? `Delivery: ${order.delivery_address || 'Address unavailable'}` : `Pickup: ${order.pickup_branch || 'Branch'}`}</p>{order.scheduled_for && <p>Scheduled: {new Date(order.scheduled_for).toLocaleString()}</p>}<small>Live updates are enabled. Keep this window open to receive status changes.</small></>}</div></div></div>;
}
