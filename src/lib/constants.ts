export const PACKAGE_ID =
  import.meta.env.VITE_PACKAGE_ID ?? '0xb0230f55f042d55838f312cb193ec67df1ed2a0fb2ce48a18183e7e67878103f';

export const REGISTRY_ID =
  import.meta.env.VITE_REGISTRY_ID ?? '0xc7c1b0db4d7a7268197af81821ac0bbd3d2db2a756400507fc0a32666d4416fd';

export const CLOCK_ID = '0x6';

export const WALRUS_AGGREGATOR =
  import.meta.env.VITE_WALRUS_AGGREGATOR ??
  'https://aggregator.walrus-mainnet.walrus.space';

export const WALRUS_PUBLISHER =
  import.meta.env.VITE_WALRUS_PUBLISHER ??
  'https://publisher.walrus-mainnet.walrus.space';

export const WALRUS_PUBLISHER_FALLBACKS: string[] = [
  import.meta.env.VITE_WALRUS_PUBLISHER ?? 'https://publisher.walrus-mainnet.walrus.space',
  'https://walrus-mainnet-publisher-1.staketab.org',
];

export const WALRUS_EPOCHS_CONFIG = 5;
export const WALRUS_EPOCHS_RESPONSE = 10;
export const WALRUS_EPOCHS_FILE = 10;

export const NETWORK = import.meta.env.VITE_NETWORK ?? 'mainnet';
export const SEAL_THRESHOLD = 2;
