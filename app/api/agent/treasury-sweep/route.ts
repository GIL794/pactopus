import { NextRequest, NextResponse } from 'next/server';
import { authorizeAdminRequest } from '@/lib/admin-auth';
import { isLegacyArcRouteEnabled, buildLegacyRouteDecommissionedResponse } from '@/lib/legacy-route-gate';
import { ethers } from 'ethers';
import { CONTRACTS } from '@/lib/arc';
import { createCircleSigner, approveAndDepositToVaultERC4626 } from '@/lib/circle-wallet-kit';
import { sponsorGasForUserOp } from '@/lib/paymaster-kit';

const ARC_RPC_URL = process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://testnet.arc.eco/rpc';

interface BalanceResult {
  ok: boolean;
  balanceRaw?: bigint;
  err?: Error;
}

export async function POST(request: NextRequest) {
  if (!isLegacyArcRouteEnabled()) {
    return buildLegacyRouteDecommissionedResponse('/api/agent/treasury-sweep');
  }
  const auth = authorizeAdminRequest(request.headers.get('authorization'), process.env.AGENT_ADMIN_TOKEN);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const key = process.env.ARC_AGENT_PRIVATE_KEY;
    if (!key) {
      const hint = process.env.NODE_ENV === 'production'
        ? 'Set ARC_AGENT_PRIVATE_KEY in Vercel Project → Environment Variables. Re-deploy after setting.'
        : 'Set ARC_AGENT_PRIVATE_KEY in .env.local then restart dev server.';
      return NextResponse.json(
        {
          status: 'skipped',
          error: 'Agent private key not configured.',
          hint,
        },
        { status: 424 }
      );
    }

    const yieldVaultAddress = process.env.ARC_YIELD_VAULT_ADDRESS || process.env.NEXT_PUBLIC_YIELD_VAULT_ADDRESS;
    if (!yieldVaultAddress || !/^0x[a-fA-F0-9]{40}$/.test(yieldVaultAddress)) {
      return NextResponse.json(
        {
          status: 'skipped',
          error: 'ERC-4626 Yield Vault contract address not configured.',
          hint: 'Set ARC_YIELD_VAULT_ADDRESS to a deployed ERC-4626 vault address on Arc.',
        },
        { status: 424 }
      );
    }

    const signer = await createCircleSigner({ privateKey: key, blockchain: 'ARC-TESTNET' });

    const timeoutMs = 15_000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    let providerBalance: { ok: boolean; balanceRaw?: bigint; err?: Error } | null = null;
    try {
      const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
      const usdcBalanceContract = new ethers.Contract(CONTRACTS.USDC, ['function balanceOf(address owner) view returns (uint256)'], provider);
      const balancePromise = (async () => {
        try {
          const balanceRaw = await usdcBalanceContract.balanceOf(signer.address);
          return { ok: true as const, balanceRaw: balanceRaw as bigint };
        } catch (e) { return { ok: false as const, err: e instanceof Error ? e : new Error(String(e)) }; }
      })();
      const timeoutPromise = new Promise<{ok:false;err:Error}>((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(new Error(`Treasury sweep RPC timed out after ${timeoutMs}ms`)));
      });
      providerBalance = await Promise.race([balancePromise, timeoutPromise]) as BalanceResult;
    } catch (err) {
      providerBalance = { ok: false, err: err instanceof Error ? err : new Error(String(err)) };
    } finally {
      clearTimeout(timeoutId);
    }
    if (!providerBalance || !providerBalance.ok) {
      return NextResponse.json(
        {
          status: 'skipped',
          error: providerBalance?.err?.message || 'Could not read agent balance via RPC.',
          hint: 'Verify ARC_RPC_URL is reachable and the Arc Testnet chain is live.',
        },
        { status: 424 }
      );
    }
    const balance = parseFloat(ethers.formatUnits(providerBalance.balanceRaw!, 6));

    const reserveThreshold = 100.00;

    if (balance <= reserveThreshold) {
      return NextResponse.json({
        status: 'skipped',
        message: `Agent balance (${balance} USDC) is below the sweep threshold (${reserveThreshold} USDC). No action taken.`
      }, { status: 200 });
    }

    const sweepAmount = balance - reserveThreshold;
    const sweepAmountRaw = ethers.parseUnits(sweepAmount.toFixed(6), 6);

    const depositCallDataHex = ethers.hexlify(ethers.toUtf8Bytes(`deposit:${sweepAmountRaw.toString()}:${signer.address}`));
    const sponsoredSweepOp = await sponsorGasForUserOp({
      sender: signer.address,
      nonce: BigInt(0),
      callData: depositCallDataHex,
      callGasLimit: BigInt(500000),
    });

    const depositTx = await approveAndDepositToVaultERC4626(
      signer,
      CONTRACTS.USDC,
      yieldVaultAddress,
      sweepAmountRaw
    );

    const receipt = await depositTx.wait();

    return NextResponse.json({
      status: 'success',
      sweptAmount: sweepAmount.toFixed(6),
      txHash: receipt?.hash || depositTx.hash,
      sponsorshipHash: sponsoredSweepOp.sponsorshipHash,
      vault: yieldVaultAddress,
      message: `Successfully swept ${sweepAmount.toFixed(6)} USDC into the yield vault on Arc.`
    }, { status: 200 });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errMsg || 'Yield sweep execution failed' }, { status: 500 });
  }
}
