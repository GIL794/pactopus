/* eslint-disable @typescript-eslint/no-require-imports */
// Route-level tests against a local mock RPC and a throwaway JSON store in a temp directory.
// No network, no database, no production data.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pactopus-routes-'));
process.chdir(tmp);
delete process.env.DATABASE_URL;
process.env.NODE_ENV = 'test';

const PAYER = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const RECIPIENT = 'So11111111111111111111111111111111111111112';
let sigCounter = 0;
const nextSig = () => require('../lib/solana.ts').encodeBase58(new Uint8Array(64).fill(++sigCounter + 1));
let txToServe = null;

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const rpc = JSON.parse(body || '{}');
    res.setHeader('Content-Type', 'application/json');
    if (rpc.method === 'getTransaction') return res.end(JSON.stringify({ result: txToServe }));
    if (rpc.method === 'getLatestBlockhash') return res.end(JSON.stringify({ result: { value: { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 1 } } }));
    if (rpc.method === 'getTokenAccountsByOwner') return res.end(JSON.stringify({ result: { value: [] } }));
    res.end(JSON.stringify({ result: { value: null } }));
  });
});

let url;
test.before(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}`;
  process.env.NEXT_PUBLIC_SOLANA_DEVNET_RPC_URL = url;
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL = url;
});
test.after(() => server.close());

function load() {
  require('./helpers/ts-loader.cjs');
  return {
    store: require('../lib/store.ts'),
    solana: require('../lib/solana.ts'),
    pay: require('../app/api/pay/route.ts'),
    solanaPay: require('../app/api/solana-pay/[id]/route.ts'),
    actions: require('../app/api/actions/pay/[id]/route.ts'),
  };
}

function txFor(solana, net, fee, reference) {
  const MINT = solana.ACTIVE_SOLANA_CLUSTER.tokens.USDC.mint;
  const bal = (owner, amount) => ({ accountIndex: 1, mint: MINT, owner, uiTokenAmount: { amount: String(amount), decimals: 6 } });
  const total = 2000n * 1000000n;
  return {
    meta: {
      err: null,
      preTokenBalances: [bal(PAYER, total), bal(RECIPIENT, 0), bal(solana.SOLANA_PLATFORM_WALLET, 0)],
      postTokenBalances: [bal(PAYER, total - net - fee), bal(RECIPIENT, net), bal(solana.SOLANA_PLATFORM_WALLET, fee)],
    },
    transaction: { message: { accountKeys: [{ pubkey: PAYER, signer: true }, { pubkey: RECIPIENT }, { pubkey: solana.SOLANA_PLATFORM_WALLET }, { pubkey: reference }], instructions: [] } },
  };
}

async function newInvoice(store, feeModel) {
  return store.createInvoice({
    amount: '1000', currency: 'USDC', description: 'route test', recipientAddress: RECIPIENT,
    network: 'solana', feeModel,
  });
}

function jsonRequest(NextRequest, urlPath, body) {
  return new NextRequest(`http://localhost${urlPath}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

test('new invoices are stored as payer-additive-v2; legacy invoice stays deduct-v1', async () => {
  const { store } = load();
  assert.equal((await newInvoice(store)).feeModel, 'payer-additive-v2');
  assert.equal((await newInvoice(store, 'deduct-v1')).feeModel, 'deduct-v1');
});

test('/api/solana-pay v2 without a signature quotes the standard total and points Seeker holders to checkout', async () => {
  const { store, solanaPay } = load();
  const { NextRequest } = require('next/server');
  const inv = await newInvoice(store);
  const res = await solanaPay.POST(jsonRequest(NextRequest, `/api/solana-pay/${inv.id}`, { account: PAYER }), { params: Promise.resolve({ id: inv.id }) });
  const data = await res.json();
  assert.equal(res.status, 200, JSON.stringify(data));
  assert.match(data.message, /1005/);
  assert.match(data.message, new RegExp(`/pay/${inv.id}`));
});

test('/api/actions/pay v2 lists one standard action and the sign-in note', async () => {
  const { store, actions } = load();
  const { NextRequest } = require('next/server');
  const inv = await newInvoice(store);
  const res = await actions.GET(new NextRequest(`http://localhost/api/actions/pay/${inv.id}`), { params: Promise.resolve({ id: inv.id }) });
  const data = await res.json();
  assert.equal(data.links.actions.length, 1);
  assert.match(data.title, /1005/);
  assert.match(data.description, /signing in/);
});

async function postPay(inv, solana, pay, net, fee) {
  const { NextRequest } = require('next/server');
  txToServe = txFor(solana, net, fee, inv.referencePubkey);
  const res = await pay.POST(jsonRequest(NextRequest, '/api/pay', { invoiceId: inv.id, txHash: nextSig(), payerAddress: PAYER }));
  return { status: res.status, data: await res.json() };
}

test('/api/pay v2: Seeker-rate payment from an unauthenticated payer address is NOT accepted', async () => {
  const { store, solana, pay } = load();
  const inv = await newInvoice(store);
  const r = await postPay(inv, solana, pay, 1000n * 1000000n, 2500000n);
  assert.notEqual(r.data.status, 'paid', JSON.stringify(r.data));
  assert.equal(r.status, 402);
});

test('/api/pay v2: exact standard quote (1000 + 5.00) is accepted and recorded', async () => {
  const { store, solana, pay } = load();
  const inv = await newInvoice(store);
  const r = await postPay(inv, solana, pay, 1000n * 1000000n, 5n * 1000000n);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.status, 'paid');
});

test('/api/pay v2: overpaid fee is a discrepancy, not paid', async () => {
  const { store, solana, pay } = load();
  const inv = await newInvoice(store);
  const r = await postPay(inv, solana, pay, 1000n * 1000000n, 6n * 1000000n);
  assert.equal(r.status, 402);
});

test('/api/pay legacy deduct-v1 invoice still verifies the old way (995 + 5.00)', async () => {
  const { store, solana, pay } = load();
  const inv = await newInvoice(store, 'deduct-v1');
  const r = await postPay(inv, solana, pay, 995n * 1000000n, 5n * 1000000n);
  assert.equal(r.status, 200, JSON.stringify(r.data));
});
