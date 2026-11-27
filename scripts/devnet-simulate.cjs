/* eslint-disable @typescript-eslint/no-require-imports */
// Devnet SIMULATION only. Builds the same atomic split transaction the app serves and asks a devnet
// RPC to simulate it with signature checks off. It never signs and never calls sendTransaction.
// Usage: PAYER=<pubkey> RECIPIENT=<pubkey> TREASURY=<pubkey> MINT=<devnet usdc mint> node scripts/devnet-simulate.cjs
// Optional: DEVNET_RPC_URL (must contain "devnet"), NET_UNITS, FEE_UNITS.
require('../tests/helpers/ts-loader.cjs');
const { buildSolanaAtomicWireTransactionBase64, deriveInvoiceReferencePubkey, buildPactopusMemo } = require('../lib/solana.ts');

const rpc = process.env.DEVNET_RPC_URL || 'https://api.devnet.solana.com';
if (!/devnet/i.test(rpc)) { console.error('Refusing: RPC URL must be a devnet endpoint.'); process.exit(2); }
for (const k of ['PAYER', 'RECIPIENT', 'TREASURY', 'MINT']) {
  if (!process.env[k]) { console.error(`Missing ${k}`); process.exit(2); }
}
async function call(method, params) {
  const r = await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  return r.json();
}
(async () => {
  const bh = (await call('getLatestBlockhash', [{ commitment: 'finalized' }])).result.value.blockhash;
  const id = 'devnet-sim-' + Date.now();
  const tx = buildSolanaAtomicWireTransactionBase64({
    payer: process.env.PAYER, recipient: process.env.RECIPIENT, treasury: process.env.TREASURY, mint: process.env.MINT,
    netUnits: BigInt(process.env.NET_UNITS || '995000'), feeUnits: BigInt(process.env.FEE_UNITS || '5000'),
    memo: buildPactopusMemo(id, 'solana'), referencePubkey: deriveInvoiceReferencePubkey(id), recentBlockhash: bh,
    createRecipientAtaIfMissing: true, createTreasuryAtaIfMissing: true,
  });
  const sim = await call('simulateTransaction', [tx, { encoding: 'base64', sigVerify: false, replaceRecentBlockhash: true, commitment: 'confirmed' }]);
  console.log(JSON.stringify({ rpcError: sim.error || null, err: sim.result && sim.result.value.err, logs: sim.result && sim.result.value.logs }, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
