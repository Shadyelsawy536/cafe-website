import { supabase } from './supabase';

export type PaymentProvider = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
};

export async function loadPaymentProviders(restaurantId: string): Promise<PaymentProvider[]> {
  if (!restaurantId) {
    return [{ id: 'cash', name: 'Cash', slug: 'cash', is_active: true }];
  }

  // Customer checkout uses the public anon key, so the staff-only account
  // table is read through a narrow Edge Function that returns metadata only.
  const { data, error } = await supabase.functions.invoke('public-payment-providers', {
    body: { restaurantId },
  });

  if (error) throw new Error(error.message || 'Unable to load payment methods.');
  if (data?.error) throw new Error(String(data.error));
  if (!Array.isArray(data?.providers)) {
    throw new Error('Payment methods response was invalid.');
  }

  return data.providers as PaymentProvider[];
}
