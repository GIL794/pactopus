import { NextRequest, NextResponse } from 'next/server';
import { getInvoice, getSubscriptionTier } from '@/lib/store';
import { getFeeBpsForTier } from '@/lib/billing';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const invoice = await getInvoice(id);
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    const ownerForTier = invoice.ownerAddress && !invoice.isSystem ? invoice.ownerAddress : invoice.recipientAddress;
    const tier = await getSubscriptionTier(ownerForTier);
    const feeBps = getFeeBpsForTier(tier);
    return NextResponse.json({ invoice, feeBps, creatorTier: tier });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errMsg || 'Failed to fetch invoice' }, { status: 500 });
  }
}
