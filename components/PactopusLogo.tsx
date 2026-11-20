'use client';

import React from 'react';
import Image from 'next/image';
import { useOptionalWallet } from '@/lib/wallet';
import type { SupportedNetworkId } from '@/lib/store';

export interface PactopusLogoProps {
  /** Height in pixels or CSS units (default 36) */
  height?: number | string;
  /** Width in pixels or CSS units (default 'auto') */
  width?: number | string;
  /** Whether to show the companion wordmark 'Pactopus' */
  showWordmark?: boolean;
  /** Additional CSS class names */
  className?: string;
  /** Inline style overrides */
  style?: React.CSSProperties;
  /** Explicit network override ('solana' | 'seeker' | 'arc' | 'algorand') */
  network?: SupportedNetworkId;
  /** 'emblem' (default) shows the cybernetic scholar mascot mark; 'full' shows the complete banner */
  variant?: 'emblem' | 'full';
  /** Alternative image source (default '/logo.png') */
  src?: string;
  /** Image alt text */
  alt?: string;
}

export default function PactopusLogo({
  height = 36,
  width = 'auto',
  showWordmark = true,
  className = '',
  style = {},
  network: networkProp,
  variant = 'emblem',
  src = '/logo.png',
  alt = 'Pactopus — Solana Seeker Adaptive Octopus Logo',
}: PactopusLogoProps) {
  const wallet = useOptionalWallet();
  const activeNetwork = networkProp || wallet?.network || 'solana';

  const markHeight = typeof height === 'number' ? `${height}px` : height;
  const isEmblem = variant === 'emblem';

  return (
    <div
      className={`pactopus-adaptive-logo ${className}`}
      data-network={activeNetwork}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.625rem',
        textDecoration: 'none',
        userSelect: 'none',
        ...style,
      }}
    >
      {/* ── Official Pactopus Scholar Mascot Logo Mark ─────────────── */}
      <span
        className={`pactopus-logo-mark network-${activeNetwork}`}
        style={{
          height: markHeight,
          width: isEmblem ? markHeight : (typeof width === 'number' ? `${width}px` : width),
          aspectRatio: isEmblem ? '1 / 1' : undefined,
        }}
      >
        <Image
          src={src}
          alt={alt}
          width={1024}
          height={1024}
          priority
          className={`pactopus-logo-img variant-${variant} network-${activeNetwork}`}
          data-network={activeNetwork}
        />
      </span>

      {/* ── Wordmark with Network-Adaptive Color Palette ────────────── */}
      {showWordmark && (
        <span className="pactopus-wordmark">
          <span className="pactopus-wordmark-pact">Pact</span>
          <span className="pactopus-wordmark-opus">opus</span>
        </span>
      )}
    </div>
  );
}
