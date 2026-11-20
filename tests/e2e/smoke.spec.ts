import { test as base, expect, type Page, type Route } from '@playwright/test';

const wallet = '0x0000000000000000000000000000000000000003';
const invoice = {
  id: 'fixture-invoice', amount: '100.00', currency: 'USDC',
  description: 'Synthetic design work', recipientName: 'Test Payee',
  recipientAddress: wallet, ownerAddress: wallet, network: 'arc',
  status: 'pending', createdAt: '2026-10-08T12:00:00.000Z',
};
// Every API call is mocked, and every external browser request is blocked.
const test = base.extend({
  page: async ({ page }: { page: Page }, run: (r: Page) => Promise<void>) => {
    const unexpected: string[] = [];
    await page.route('**/*', async (route: Route) => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://127.0.0.1:4317') return route.abort('blockedbyclient');
      if (url.pathname.startsWith('/api/')) {
        unexpected.push(`${route.request().method()} ${url.pathname}`);
        return route.fulfill({ status: 500, json: { error: 'Unexpected API request in isolated test' } });
      }
      return route.continue();
    });
    await run(page);
    expect(unexpected, 'No unmocked API calls may reach the server').toEqual([]);
  },
});

async function connectMockWallet(page: Page) {
  await page.addInitScript(({ wallet }: { wallet: string }) => {
    localStorage.setItem('pactopus_wallet', JSON.stringify({ type: 'metamask', address: wallet, network: 'arc' }));
    window.ethereum = {
      isMetaMask: true, on() {}, removeListener() {},
      async request({ method }: { method: string }) {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [wallet];
        if (method === 'eth_chainId') return '0x4cef52';
        if (method === 'eth_call') return '0x0';
        if (method === 'personal_sign') return '0x' + '11'.repeat(65); // deliberately fake, browser UI only
        throw new Error(`Mock wallet forbids ${method}`);
      },
    };
  }, { wallet });
  await page.route('**/api/invoices?*', (route: Route) => route.fulfill({ json: {
    tier: 'free', invoicesUsedThisMonth: 0, invoicesAllowedThisMonth: 5, invoices: [],
  } }));
}

test('invalid invoice fields are rejected before an API call', async ({ page }: { page: Page }) => {
  await page.goto('/create');
  await page.getByRole('button', { name: 'Create invoice', exact: true }).click();
  await expect(page.getByText('Add an amount greater than 0')).toBeVisible();
  await expect(page.getByText('Add a short description (at least 3 characters)')).toBeVisible();
  await expect(page.getByText('Paste a valid Arc/EVM wallet address (starts with 0x)')).toBeVisible();
});

test('mock invoice submission sends expected fields and opens payment link', async ({ page }: { page: Page }) => {
  await connectMockWallet(page);
  let submitted: Record<string, unknown> | undefined;
  await page.route('**/api/invoices', async (route: Route) => {
    expect(route.request().method()).toBe('POST');
    submitted = route.request().postDataJSON();
    await route.fulfill({ json: { invoice } });
  });
  await page.route('**/api/invoices/fixture-invoice', (route: Route) => route.fulfill({ json: { invoice } }));
  await page.goto('/create');
  await expect(page.locator('#invoice-wallet-address')).toHaveValue(wallet);
  await page.locator('#invoice-amount-input').fill('100');
  await page.locator('#invoice-description').fill(invoice.description);
  await page.locator('#invoice-recipient-name').fill(invoice.recipientName);
  await page.getByRole('button', { name: 'Create invoice', exact: true }).click();
  await expect(page).toHaveURL(/\/pay\/fixture-invoice\?created=true$/);
  expect(submitted).toMatchObject({ amount: '100', currency: 'USDC', description: invoice.description, recipientAddress: wallet, network: 'arc' });
  await expect(page.getByText('Synthetic design work')).toBeVisible();
});

test('free monthly limit blocks invoice submission', async ({ page }: { page: Page }) => {
  await connectMockWallet(page);
  await page.route('**/api/invoices?*', (route: Route) => route.fulfill({ json: {
    tier: 'free', invoicesUsedThisMonth: 5, invoicesAllowedThisMonth: 5, invoices: [],
  } }));
  await page.goto('/create');
  await expect(page.locator('#create-invoice-submit-btn')).toBeDisabled();
  await expect(page.locator('#create-invoice-submit-btn')).toContainText('Upgrade');
});

test('paid fixture shows receipt, not a payment action', async ({ page }: { page: Page }) => {
  await page.route('**/api/invoices/fixture-invoice', (route: Route) => route.fulfill({ json: { invoice: { ...invoice, status: 'paid' } } }));
  await page.goto('/pay/fixture-invoice');
  await expect(page.getByRole('heading', { name: 'Payment received!' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Pay 100/ })).toHaveCount(0);
  await page.screenshot({ path: `test-results/paid-${test.info().project.name}.png`, fullPage: true });
});
