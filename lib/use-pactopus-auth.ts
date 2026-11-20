'use client';

import { useCallback } from 'react';
import { useWallet } from './wallet';
import { buildSignedHeaders, buildAlgorandSignedHeaders, buildSolanaSignedHeaders } from './auth';

/**
 * React hook for producing `fetch` headers for Solana Ed25519 signMessage,
 * Arc personal_sign, or Algorand Pera signData authentication.
 *
 * Each protected call signs its method, path, body checksum and a fresh nonce.
 * Solana/Seeker and Algorand use a UUID nonce stored server-side to reject replay.
 */
export function usePactopusAuth() {
  const { address, signMessage, network, seekerVerified } = useWallet();

  const sign = useCallback(async (opts: {
    method: 'GET' | 'POST' | 'PUT';
    pathname: string;
    body?: unknown;
  }): Promise<Record<string, string>> => {
    if (network === 'solana' || network === 'seeker') {
      if (!address) return {};
      return buildSolanaSignedHeaders({
        wallet: address,
        signMessage,
        method: opts.method,
        pathname: opts.pathname,
        body: opts.body,
        network,
        seekerVerified,
      });
    }
    if (network === 'algorand') {
      if (!address) throw new Error('Connect Pera Wallet before signing.');
      return buildAlgorandSignedHeaders({ wallet: address, signMessage, method: opts.method, pathname: opts.pathname, body: opts.body });
    }
    if (!address) return {};
    return buildSignedHeaders({
      wallet: address,
      signMessage,
      method: opts.method,
      pathname: opts.pathname,
      body: opts.body,
    });
  }, [address, signMessage, network, seekerVerified]);

  const signedFetch = useCallback(async (input: string, init?: RequestInit & { method: 'GET' | 'POST' | 'PUT' }): Promise<Response> => {
    const method = (init?.method || 'GET') as 'GET' | 'POST' | 'PUT';
    let body: unknown = undefined;
    if (init?.body && typeof init.body === 'string') {
      try { body = JSON.parse(init.body); } catch { body = init.body; }
    }
    const urlPath = new URL(input, typeof window === 'undefined' ? 'http://localhost' : window.location.origin).pathname;
    const extraHeaders = await sign({ method, pathname: urlPath, body });
    const merged: RequestInit = {
      ...(init || {}),
      method,
      headers: {
        'Content-Type': method !== 'GET' ? 'application/json' : (init?.headers as Record<string, string> | undefined)?.['Content-Type'] || undefined,
        ...(init?.headers as Record<string, string> || {}),
        ...extraHeaders,
      } as Record<string, string>,
    };
    return fetch(input, merged);
  }, [sign]);

  return { sign, signedFetch, isAuthenticated: Boolean(address) };
}
