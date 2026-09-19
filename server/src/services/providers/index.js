// ---------------------------------------------------------------------------
// Email provider interface (spec section 18)
//
//   EmailProvider
//        |
//   +----+-----+
//   |          |
// Gmail      Mock        (Outlook slots in here later)
//
// Every provider implements: listMessages, getMessage, setRead, sendMessage,
// getProfile. Nothing outside this folder knows about Gmail-specific types.
// ---------------------------------------------------------------------------
import { features } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import gmailProvider from './gmailProvider.js';
import mockProvider from './mockProvider.js';

export const PROVIDERS = {
  GMAIL: gmailProvider,
  MOCK: mockProvider,
};

// Registered for future use; selecting it currently produces a clear error.
PROVIDERS.OUTLOOK = {
  id: 'outlook',
  unsupported: true,
};

export const SUPPORTED_PROVIDERS = Object.keys(PROVIDERS).filter((key) => !PROVIDERS[key].unsupported);

/**
 * Returns the provider implementation for an email account.
 * A GMAIL account silently falls back to the mock provider while Google
 * credentials are absent, which keeps the app usable end to end.
 */
export const getProviderForAccount = (account) => {
  const provider = PROVIDERS[account?.provider || 'MOCK'];
  if (!provider) throw new AppError(`Unknown email provider "${account?.provider}"`, 400, 'UNKNOWN_PROVIDER');
  if (provider.unsupported) {
    throw new AppError(
      `${account.provider} support is planned but not implemented yet.`,
      501,
      'PROVIDER_NOT_IMPLEMENTED',
    );
  }
  if (account?.provider === 'GMAIL' && !features.googleOAuth && features.mockProvider) return mockProvider;
  return provider;
};

export const getProviderByName = (name) => {
  const provider = PROVIDERS[name];
  if (!provider) throw new AppError(`Unknown email provider "${name}"`, 400, 'UNKNOWN_PROVIDER');
  return provider;
};

export { gmailProvider, mockProvider };
