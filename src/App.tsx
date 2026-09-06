import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { getRestaurantSlug, loadRestaurant } from './lib/tenant';
import { loadStore, type StoreData } from './lib/store';
import type { Product } from './types';

const money = (value: number, currency: string) => new Intl.NumberFormat('en-EG', { style: 'currency', currency }).format(value);

export default function App() {
  const [store, setStore] = useState<StoreData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<{ product: Product; quantity: number }[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const slug = getRestaurantSlug();
        if (!slug) throw new Error('No restaurant was selected. Open with ?restaurant=cafe.');
        const restaurant = await loadRestaurant(slug);
        const data = await loadStore(restaurant);
        if (!cancelled) setStore(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unable to load restaurant.');
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const products = useMemo(() => {
    if (!store) return [];
    const q = query.trim().toLowerCase();
    return store.products.filter(p => (activeCategory === 'all' || p.category_id === activeCategory) && (!q || `${p.name} ${p.description ?? ''}`.toLowerCase().includes(q)));
  }, [store, activeCategory, query]);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cart.reduce((sum, item) => sum + item.quantity * Number(item.product.base_price), 0);
  const addToCart = (product: Product) => setCart(current => { const found = current.find(x => x.product.id === product.id); return found ? current.map(x => x.product.id === product.id ? { ...x, quantity: x.quantity + 1 } : x) : [...current, { product, quantity: 1 }]; });

  if (loading) return <div className="center-state"><div className="spinner" />Loading restaurant…</div>;
  if (error || !store) return <div className="center-state error-state"><strong>Unable to load this restaurant</strong><span>{error}</span></div>;
  const { restaurant, branding, settings } = store;
  const closed = settings.operational_status !== 'open';
  const theme = { '--primary': branding.customer_primary_color || '#111', '--secondary': branding.customer_secondary_color || '#fff', '--background': branding.customer_background_color || '#f8f7f4' } as CSSProperties;

  return <div className="app" style={theme}>
    <header className="header"><div className="header-inner"><a className="brand" href={`?restaurant=${restaurant.slug}`}>{branding.customer_logo_url ? <img src={branding.customer_logo_url} alt={restaurant.name} /> : <span className="logo-fallback">{restaurant.name.charAt(0)}</span>}<span>{restaurant.name}</span></a><div className="header-actions"><a href="#about">About</a><a href="#locations">Locations</a><button className="cart-button" onClick={() => document.getElementById('cart')?.scrollIntoView({ behavior: 'smooth' })}>Cart <b>{cartCount}</b></button></div></div></header>
    <main>
      <section className="hero" style={branding.customer_cover_url ? { backgroundImage: `linear-gradient(90deg, rgba(0,0,0,.68), rgba(0,0,0,.2)), url(${branding.customer_cover_url})` } : undefined}><div className="hero-content"><span className="eyebrow">Welcome</span><h1>{restaurant.name}</h1><p>{restaurant.description || 'Freshly prepared favorites, made for your day.'}</p><div className="hero-meta"><span>⏱ {settings.preparation_time_minutes} min prep</span>{settings.accepts_delivery && <span>Delivery available</span>}{settings.accepts_pickup && <span>Pickup available</span>}</div></div></section>
      {closed && <div className="notice"><strong>{settings.operational_status === 'temporarily_closed' ? 'Temporarily closed' : 'Currently closed'}</strong><span>{settings.closure_message || 'Online ordering is currently unavailable.'}</span></div>}
      <section className="menu-section"><div className="section-heading"><div><span className="eyebrow">Our menu</span><h2>Choose your favorite</h2></div><input className="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search menu…" /></div><div className="category-bar"><button className={activeCategory === 'all' ? 'active' : ''} onClick={() => setActiveCategory('all')}>All</button>{store.categories.map(c => <button key={c.id} className={activeCategory === c.id ? 'active' : ''} onClick={() => setActiveCategory(c.id)}>{c.name}</button>)}</div><div className="product-grid">{products.map(product => <article className="product-card" key={product.id} onClick={() => setSelected(product)}><div className="product-image">{product.image_url ? <img src={product.image_url} alt="" loading="lazy" /> : <span>{product.name.charAt(0)}</span>}{product.best_seller && <span className="badge">Best seller</span>}</div><div className="product-body"><h3>{product.name}</h3><p>{product.description || 'Prepared fresh to order.'}</p><div className="product-footer"><strong>{money(Number(product.base_price), settings.currency)}</strong><button onClick={e => { e.stopPropagation(); addToCart(product); }}>+ Add</button></div></div></article>)}</div>{!products.length && <div className="empty">No products found.</div>}</section>
      <section id="cart" className="cart-section"><div className="section-heading"><div><span className="eyebrow">Your order</span><h2>Cart</h2></div></div>{cart.length === 0 ? <div className="empty">Your cart is empty. Add something delicious from the menu.</div> : <div className="cart-card">{cart.map(item => <div className="cart-row" key={item.product.id}><div><strong>{item.product.name}</strong><span>{money(Number(item.product.base_price), settings.currency)} each</span></div><div className="qty"><button onClick={() => setCart(c => c.map(x => x.product.id === item.product.id ? { ...x, quantity: Math.max(0, x.quantity - 1) } : x).filter(x => x.quantity)}>−</button><b>{item.quantity}</b><button onClick={() => addToCart(item.product)}>+</button></div></div>)}<div className="cart-total"><span>Subtotal</span><strong>{money(cartTotal, settings.currency)}</strong></div><button className="checkout" disabled={closed || cartTotal < Number(settings.min_order_amount)}>{closed ? 'Ordering unavailable' : cartTotal < Number(settings.min_order_amount) ? `Minimum order ${money(Number(settings.min_order_amount), settings.currency)}` : 'Continue to checkout'}</button></div>}</section>
      <section id="about" className="info-section"><div><span className="eyebrow">About</span><h2>{restaurant.name}</h2><p>{restaurant.description || 'We look forward to serving you.'}</p></div><div><span className="eyebrow">Contact</span><p>{restaurant.phone || 'Phone not provided'}</p><p>{restaurant.email || 'Email not provided'}</p><p>{restaurant.address || 'Address not provided'}</p></div></section>
      <section id="locations" className="locations"><div className="section-heading"><div><span className="eyebrow">Find us</span><h2>Locations</h2></div></div><div className="location-grid">{store.locations.map(location => <div className="location-card" key={location.id}><h3>{location.name}{location.is_primary && <span className="primary-dot">Primary</span>}</h3><p>{location.address || restaurant.address || 'Address not provided'}</p>{location.map_url && <a href={location.map_url} target="_blank" rel="noreferrer">Open map ↗</a>}</div>)}</div></section>
    </main>
    <footer><span>© {new Date().getFullYear()} {restaurant.name}</span><div>{store.socialLinks.map(link => <a key={link.platform} href={link.url} target="_blank" rel="noreferrer">{link.label || link.platform}</a>)}</div></footer>
    {selected && <div className="modal-backdrop" onClick={() => setSelected(null)}><div className="modal" onClick={e => e.stopPropagation()}>{selected.image_url && <img src={selected.image_url} alt="" />}<div className="modal-content"><button className="close" onClick={() => setSelected(null)}>×</button><span className="eyebrow">{store.categories.find(c => c.id === selected.category_id)?.name || 'Menu item'}</span><h2>{selected.name}</h2><p>{selected.description}</p><strong className="modal-price">{money(Number(selected.base_price), settings.currency)}</strong><button className="checkout" onClick={() => { addToCart(selected); setSelected(null); }}>Add to cart</button></div></div></div>}
  </div>;
}
