# Cafe Customer Website

Responsive white-label restaurant ordering storefront built with React, Vite and Supabase.

## Tenant URL

The storefront resolves the restaurant by slug. For GitHub Pages/local testing use:

`/?restaurant=cafe`

Later this can be mapped to `/cafe`, `cafe.yourplatform.com`, or a custom domain without changing the storefront data layer.

## Local setup

1. Copy `.env.example` to `.env`.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Run `npm install`.
4. Run `npm run dev`.

The frontend uses only the public Supabase client key. Never put a service-role key in `.env` for a browser build.

## Current slice

- White-label tenant resolution by restaurant slug
- Dynamic restaurant branding
- Dynamic menu/categories/products
- Dynamic currency and restaurant settings
- Search and category filtering
- Product details
- Responsive cart
- Business/operational status display
- Locations and social links
- GitHub Pages deployment workflow

Checkout/payment/order submission will be connected in the integration phase after the storefront foundation is verified.
