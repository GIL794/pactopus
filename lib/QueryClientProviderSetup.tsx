'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useEffect, useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from '@/lib/theme';
import { WalletProvider } from '@/lib/wallet';
import { trackDailyUsage } from '@/lib/milestones';

export default function QueryClientSetup({ children }: { children: ReactNode }) {
  // Create the QueryClient instance on client state to prevent sharing client state across requests
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: true,
        staleTime: 5000,
      },
    },
  }));

  useEffect(() => {
    trackDailyUsage();
  }, []);

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <WalletProvider>
          {children}
        </WalletProvider>
        <div aria-live="polite" aria-atomic="true" aria-relevant="additions text">
          <Toaster
            position="bottom-right"
            toastOptions={{
              duration: 4500,
              style: {
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-elevated)',
              },
            }}
          />
        </div>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
