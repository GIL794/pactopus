import { NextResponse } from 'next/server';

const ACTIONS_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: ACTIONS_CORS_HEADERS });
}

/**
 * Solana Actions & Blinks discovery manifest (`/actions.json`)
 * Maps `/pay/[id]` invoice links to `/api/actions/pay/[id]` so any shared Pactopus
 * invoice link unfurls as a payable Solana Blink across X, Dialect, Phantom, and Seeker.
 */
export async function GET() {
  return NextResponse.json(
    {
      rules: [
        {
          pathPattern: '/pay/*',
          apiPath: '/api/actions/pay/*',
        },
        {
          pathPattern: '/api/actions/pay/**',
          apiPath: '/api/actions/pay/**',
        },
      ],
    },
    { headers: ACTIONS_CORS_HEADERS }
  );
}
