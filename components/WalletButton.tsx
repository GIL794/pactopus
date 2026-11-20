'use client';

import { useState } from 'react';
import { useWallet } from '@/lib/wallet';
import WalletModal from './WalletModal';

export default function WalletButton() {
  const { isConnected, isConnecting, disconnect, address } = useWallet();
  const [showModal, setShowModal] = useState(false);

  if (isConnected && address) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button
          className="btn btn-secondary btn-sm"
          onClick={disconnect}
          id="disconnect-wallet-btn"
        >
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-green)', marginRight: 4 }} />
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        className="btn btn-primary btn-sm"
        onClick={() => setShowModal(true)}
        disabled={isConnecting}
        id="connect-wallet-btn"
      >
        {isConnecting ? (
          <>
            <span className="spinner-sm" />
            Connecting…
          </>
        ) : (
          'Connect Wallet'
        )}
      </button>
      {showModal && <WalletModal onClose={() => setShowModal(false)} />}
    </>
  );
}
