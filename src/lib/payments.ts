import { supabase } from './supabase';

export type PaymentProvider = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
};

export async function loadPaymentProviders(restaurantId: string): Promise<PaymentProvider[]> {
  // Cash is always available as a checkout method. Online providers are shown
  // only when this restaurant has explicitly configured an active account.
  const cash: PaymentProvider = {
    id: 'cash',
    name: 'Cash',
    slug: 'cash',
    is_active: true,
  };

  if (!restaurantId) return [cash];

  const { data: accounts, error: accountsError } = await supabase
    .from('tenant_payment_accounts')
    .select('provider_id, payment_providers(id, name, code, is_active)')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true);

  if (accountsError) {
    // Do not fall back to listing every globally enabled provider: that can
    // offer online payment for a restaurant that has not configured it.
    throw accountsError;
  }

  const onlineProviders: PaymentProvider[] = (accounts ?? [])
    .map((account: any) => {
      const provider = Array.isArray(account.payment_providers)
        ? account.payment_providers[0]
        : account.payment_providers;
      if (!provider || provider.is_active !== true) return null;
      return {
        id: provider.id,
        name: provider.code === 'paymob' ? 'Visa / Card' : provider.name,
        slug: provider.code,
        is_active: true,
      };
    })
    .filter((provider): provider is PaymentProvider => provider !== null);

  return [cash, ...onlineProviders];
}
