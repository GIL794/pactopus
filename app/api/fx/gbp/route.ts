import { NextResponse } from 'next/server';
import { fetchLiveGbpRates } from '@/lib/solana';

export const runtime = 'nodejs';

export async function GET() {
  const quote = await fetchLiveGbpRates();
  return NextResponse.json(quote, {
    headers: {
      'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600',
    },
  });
}
