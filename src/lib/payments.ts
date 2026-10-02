import { supabase } from './supabase';

export type PaymentProvider = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
};

export async function loadPaymentProviders(_restaurantId: string): Promise<PaymentProvider[]> {
  // Cash is a checkout method, not a payment provider, so it is represented
  // locally. Online card payments use the active Paymob provider; credentials
  // remain server-side and are validated by the create-payment Edge Function.
  const { data, error } = await supabase
    .from('payment_providers')
    .select('id,name,slug,is_active')
    .eq('is_active', true)
    .order('name');

  if (error) throw error;

  const providers = (data ?? []) as PaymentProvider[];
  const onlineProviders = providers.map(provider =>
    provider.slug === 'paymob'
      ? { ...provider, name: 'Visa / Card' }
      : provider,
  );

  return [
    {
      id: 'cash',
      name: 'Cash',
      slug: 'cash',
      is_active: true,
    },
    ...onlineProviders,
  ];
};
