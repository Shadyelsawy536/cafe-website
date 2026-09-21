import { supabase } from './supabase';

export type PaymentProvider = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
};

export async function loadPaymentProviders(_restaurantId: string): Promise<PaymentProvider[]> {
  // Provider availability is public. Tenant credentials stay server-side in
  // tenant_payment_accounts and are validated by the create-payment Edge Function.
  const { data, error } = await supabase
    .from('payment_providers')
    .select('id,name,slug,is_active')
    .eq('is_active', true)
    .order('name');

  if (error) throw error;
  return (data ?? []) as PaymentProvider[];
};
