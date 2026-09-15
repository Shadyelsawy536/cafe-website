import type { WebSettings } from '../types';

function upsertMeta(name: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.name = name;
    document.head.appendChild(tag);
  }
  tag.content = content;
}

function upsertProperty(property: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute('property', property);
    document.head.appendChild(tag);
  }
  tag.content = content;
}

function upsertLink(rel: string, href: string, type?: string) {
  let tag = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!tag) {
    tag = document.createElement('link');
    tag.rel = rel;
    document.head.appendChild(tag);
  }
  tag.href = href;
  if (type) tag.type = type;
}

export function applyWebsiteMetadata(name: string, description: string, url: string, settings: WebSettings) {
  const title = settings.seo_title?.trim() || settings.website_name?.trim() || name;
  const seoDescription = settings.seo_description?.trim() || description || `Order from ${name} online.`;
  const image = settings.og_image_url || settings.favicon_url || undefined;
  const theme = settings.theme_color || '#111111';

  document.title = title;
  upsertMeta('description', seoDescription);
  upsertMeta('theme-color', theme);
  upsertMeta('apple-mobile-web-app-title', settings.pwa_short_name?.trim() || settings.website_name?.trim() || name);
  upsertMeta('apple-mobile-web-app-capable', 'yes');
  upsertProperty('og:title', title);
  upsertProperty('og:description', seoDescription);
  upsertProperty('og:type', 'website');
  upsertProperty('og:url', url);
  if (image) upsertProperty('og:image', image);
  if (settings.favicon_url) upsertLink('icon', settings.favicon_url);
}

let manifestObjectUrl: string | null = null;

function getRestaurantStartUrl() {
  const start = new URL(window.location.href);
  start.searchParams.delete('order');
  start.searchParams.delete('orders');
  if (!start.searchParams.has('restaurant')) start.searchParams.set('restaurant', 'cafe');
  start.hash = '';
  return start.toString();
}

export function applyDynamicPwa(name: string, _url: string, settings: WebSettings) {
  const serviceWorkerUrl = new URL('./sw.js', window.location.href).toString();

  if (!settings.pwa_enabled) {
    if (manifestObjectUrl) {
      URL.revokeObjectURL(manifestObjectUrl);
      manifestObjectUrl = null;
    }
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations
          .filter(registration => registration.scope.startsWith(`${window.location.origin}${window.location.pathname.split('/').slice(0, -1).join('/')}/`))
          .forEach(registration => void registration.unregister());
      });
    }
    return;
  }

  const basePath = window.location.pathname.endsWith('/')
    ? window.location.pathname
    : `${window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1)}`;

  const manifest = {
    name: settings.website_name?.trim() || name,
    short_name: settings.pwa_short_name?.trim() || settings.website_name?.trim() || name,
    start_url: getRestaurantStartUrl(),
    scope: `${window.location.origin}${basePath}`,
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: settings.theme_color || '#111111',
    icons: settings.favicon_url ? [
      { src: settings.favicon_url, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: settings.favicon_url, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ] : [],
  };

  if (manifestObjectUrl) URL.revokeObjectURL(manifestObjectUrl);
  manifestObjectUrl = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }));
  upsertLink('manifest', manifestObjectUrl, 'application/manifest+json');

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      void navigator.serviceWorker.register(serviceWorkerUrl, { scope: basePath }).catch(() => undefined);
    }, { once: true });
  }
}
