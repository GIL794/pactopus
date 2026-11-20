import { NextRequest, NextResponse } from 'next/server';
import { getInvoice, getSubscriptionTier } from '@/lib/store';
import { getFeeBpsForTier, getMaxCapGbpForTier } from '@/lib/billing';
import { splitSolanaAmount } from '@/lib/solana';

export async function GET(
  _request: NextRequest,
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
    const isSeeker = Boolean(invoice.seekerVerified || invoice.network === 'seeker');
    const feeBps = getFeeBpsForTier(tier, isSeeker);
    const maxCapGbp = getMaxCapGbpForTier(tier, isSeeker);
    const solanaQuote = splitSolanaAmount(invoice.amount, {
      isSeekerVerified: isSeeker,
      currency: invoice.currency,
      gbpRate: invoice.gbpRate,
    });

    return NextResponse.json({
      invoice,
      feeBps,
      maxCapGbp,
      seekerVerified: isSeeker,
      creatorTier: tier,
      quote: {
        totalDisplay: solanaQuote.totalDisplay,
        netDisplay: solanaQuote.netDisplay,
        feeDisplay: solanaQuote.feeDisplay,
        feeBps: solanaQuote.feeBps,
        maxCapGbp: solanaQuote.maxCapGbp,
        capApplied: solanaQuote.capApplied,
        gbpRate: solanaQuote.gbpRate,
        gbpTotalDisplay: solanaQuote.gbpTotalDisplay,
        gbpFeeDisplay: solanaQuote.gbpFeeDisplay,
        gbpNetDisplay: solanaQuote.gbpNetDisplay,
      },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errMsg || 'Failed to fetch invoice' }, { status: 500 });
  }
}
