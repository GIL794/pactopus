import { test, expect } from '@playwright/test';

test('real local invoice API rejects unsigned creation', async ({ request }) => {
  const response = await request.post('/api/invoices', { data: {
    amount: '1.00', currency: 'USDC', description: 'Synthetic unsigned test',
    recipientAddress: '0x0000000000000000000000000000000000000003', network: 'arc',
  } });
  expect(response.status()).toBe(401);
  expect((await response.json()).authRequired).toBe(true);
});

test('real local payment API rejects unsigned receipt', async ({ request }) => {
  const response = await request.post('/api/pay', { data: {
    invoiceId: 'synthetic-does-not-exist', network: 'arc', txHash: 'synthetic-not-a-real-receipt',
  } });
  expect(response.status()).toBe(401);
  expect((await response.json()).authRequired).toBe(true);
});
