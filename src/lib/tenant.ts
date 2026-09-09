import { supabase } from './supabase';
import type { Restaurant } from '../types';

export function getRestaurantSlug(): string {
  const querySlug = new URLSearchParams(window.location.search).get('restaurant');
  if (querySlug?.trim()) return querySlug.trim().toLowerCase();

  const parts = window.location.pathname.split('/').filter(Boolean);
  const repoBase = 'cafe-website';
  const index = parts.indexOf(repoBase);
  const candidate = index >= 0 ? parts[index + 1] : parts[0];

  return candidate?.trim()
    ? candidate.trim().toLowerCase()
    : 'cafe';
}

export async function loadRestaurant(slug: string): Promise<Restaurant> {
  const { data, error } = await supabase
    .from('restaurants')
    .select('id,name,slug,description,phone,email,address')
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error(`Restaurant "${slug}" was not found.`);

  return data as Restaurant;
}
