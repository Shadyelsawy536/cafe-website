import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import OrdersPage from './pages/OrdersPage';
import './index.css';
import './website.css';
import { supabase } from './lib/supabase';
import { getRestaurantSlug, loadRestaurant } from './lib/tenant';
import { applyDynamicPwa, applyWebsiteMetadata } from './lib/website';

type WebSettingsRow = {
  website_name: string | null;
  seo_title: string | null;
  seo_description: string | null;
  favicon_url: string | null;
  og_image_url: string | null;
  theme_color: string | null;
  pwa_enabled: boolean;
  pwa_short_name: string | null;
};

const root = document.getElementById('root')!;

function getRoute() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('restaurant') && !params.has('order') && !params.has('orders')) params.set('restaurant', 'cafe');
  return { params, orderId: params.get('order'), orders: params.has('orders') };
}

function AppRouter() {
  const [route, setRoute] = useState(getRoute);

  useEffect(() => {
    const notify = () => setRoute(getRoute());
    const originalReplaceState = history.replaceState;
    const originalPushState = history.pushState;
    history.replaceState = function (...args) { const result = originalReplaceState.apply(this, args); window.dispatchEvent(new Event('app-route-change')); return result; };
    history.pushState = function (...args) { const result = originalPushState.apply(this, args); window.dispatchEvent(new Event('app-route-change')); return result; };
    window.addEventListener('popstate', notify);
    window.addEventListener('app-route-change', notify);
    return () => {
      history.replaceState = originalReplaceState;
      history.pushState = originalPushState;
      window.removeEventListener('popstate', notify);
      window.removeEventListener('app-route-change', notify);
    };
  }, []);

  const backToMenu = () => {
    const params = new URLSearchParams(window.location.search);
    params.delete('order'); params.delete('orders');
    if (!params.has('restaurant')) params.set('restaurant', 'cafe');
    history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
  };

  if (route.orderId || route.orders) return <OrdersPage currency="EGP" initialOrderId={route.orderId} onBackToMenu={backToMenu} />;
  return <App />;
}

createRoot(root).render(<StrictMode><AppRouter /></StrictMode>);

// Add Google OAuth to the existing auth modal without changing the tenant-aware App flow.
let googleAuthButtonMounted = false;
const mountGoogleAuth = () => {
  if (googleAuthButtonMounted) return;
  const content = document.querySelector('.auth-modal .modal-content');
  const form = content?.querySelector('form');
  const switchButton = content?.querySelector('.text-button');
  if (!content || !form || !switchButton) return;
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'google-auth-button'; button.textContent = 'Continue with Google';
  button.addEventListener('click', async () => {
    button.disabled = true; button.textContent = 'Connecting…';
    const slug = getRestaurantSlug(); const redirectUrl = new URL(window.location.href); redirectUrl.searchParams.delete('order'); redirectUrl.searchParams.delete('orders'); if (slug) redirectUrl.searchParams.set('restaurant', slug);
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectUrl.toString() } });
    if (error) { button.disabled = false; button.textContent = 'Continue with Google'; const errorBox = content.querySelector('.form-error') || document.createElement('div'); errorBox.className = 'form-error'; errorBox.textContent = error.message; if (!errorBox.parentElement) content.insertBefore(errorBox, form); }
  });
  const divider = document.createElement('div'); divider.className = 'auth-divider'; divider.textContent = 'or'; content.insertBefore(divider, form); content.insertBefore(button, form); googleAuthButtonMounted = true;
};
const authObserver = new MutationObserver(mountGoogleAuth);
authObserver.observe(document.body, { childList: true, subtree: true });

// Add a persistent Orders entry to the customer header when the menu is visible.
let ordersNavMounted = false;
const mountOrdersNav = () => {
  if (ordersNavMounted) return;
  const actions = document.querySelector('.header-actions');
  if (!actions) return;
  const link = document.createElement('a');
  link.className = 'orders-nav-link'; link.textContent = 'Orders';
  const slug = getRestaurantSlug() || 'cafe';
  link.href = `?restaurant=${encodeURIComponent(slug)}&orders=1`;
  actions.insertBefore(link, actions.firstChild);
  ordersNavMounted = true;
};
const uiObserver = new MutationObserver(() => { mountGoogleAuth(); mountOrdersNav(); });
uiObserver.observe(document.body, { childList: true, subtree: true });

// Load tenant-owned website metadata once and apply it to the browser/PWA shell.
void (async () => {
  const slug = getRestaurantSlug(); if (!slug) return;
  const restaurant = await loadRestaurant(slug).catch(() => null); if (!restaurant) return;
  const { data: webSettings } = await supabase.from('restaurant_web_settings').select('website_name,seo_title,seo_description,favicon_url,og_image_url,theme_color,pwa_enabled,pwa_short_name').eq('restaurant_id', restaurant.id).maybeSingle();
  const settings: WebSettingsRow = {
    website_name: restaurant.name, seo_title: restaurant.name, seo_description: restaurant.description,
    favicon_url: restaurant.logo_url, og_image_url: restaurant.cover_image_url, theme_color: '#111111',
    pwa_enabled: true, pwa_short_name: restaurant.name,
    ...(webSettings ?? {}),
  };
  const currentUrl = window.location.href;
  applyWebsiteMetadata(restaurant.name, restaurant.description || '', currentUrl, settings);
  applyDynamicPwa(restaurant.name, currentUrl, settings);
})();

void (async () => {
  const slug = getRestaurantSlug(); if (!slug) return;
  const restaurant = await loadRestaurant(slug).catch(() => null); if (!restaurant) return;
  const ensureCustomerProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return;
    const { data: existing } = await supabase.from('customers').select('id').eq('restaurant_id', restaurant.id).eq('user_id', user.id).maybeSingle();
    if (existing) return;
    await supabase.from('customers').insert({ restaurant_id: restaurant.id, user_id: user.id, full_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Customer', phone: user.user_metadata?.phone || '' });
  };
  await ensureCustomerProfile();
  supabase.auth.onAuthStateChange((_event, session) => { if (session?.user) void ensureCustomerProfile(); });
})();
