/** Canonical public URL. Override with NEXT_PUBLIC_SITE_URL when a custom domain is attached. */
export const DEFAULT_SITE_URL = 'https://pactopus-app.vercel.app';

export function resolveSiteUrl(env: string | undefined = process.env.NEXT_PUBLIC_SITE_URL): string {
  const raw = (env || '').trim().replace(/\/+$/, '');
  return /^https:\/\/[^\s/]+$/.test(raw) ? raw : DEFAULT_SITE_URL;
}

export const SITE_URL = resolveSiteUrl();
