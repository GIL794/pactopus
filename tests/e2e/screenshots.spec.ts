import { test, type Page, type Route, type TestInfo } from '@playwright/test';

const wallet = '0x0000000000000000000000000000000000000003';
const invoicePending = {
  id: 'fixture-invoice',
  amount: '100.00',
  currency: 'USDC',
  description: 'Design consultation & smart contract audit',
  recipientName: 'Acme Studio',
  recipientAddress: wallet,
  ownerAddress: wallet,
  network: 'arc',
  status: 'pending',
  createdAt: '2026-10-08T12:00:00.000Z',
};

const invoicePaid = {
  ...invoicePending,
  status: 'paid',
  txHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
  feeTxHash: '0x2222222222222222222222222222222222222222222222222222222222222222',
  paidAt: '2026-10-08T12:05:00.000Z',
  paidBy: '0x0000000000000000000000000000000000000004',
};

async function setupPageMocks(page: Page, theme: 'light' | 'dark') {
  await page.route('**/*', async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://127.0.0.1:4317') return route.abort('blockedbyclient');
    if (url.pathname.startsWith('/api/invoices')) {
      if (url.pathname === '/api/invoices/fixture-invoice') {
        return route.fulfill({ json: { invoice: invoicePending } });
      }
      return route.fulfill({
        json: {
          tier: 'free',
          invoicesUsedThisMonth: 1,
          invoicesAllowedThisMonth: 5,
          invoices: [invoicePending, invoicePaid],
        },
      });
    }
    return route.continue();
  });

  await page.addInitScript(({ wallet, theme }: { wallet: string; theme: 'light' | 'dark' }) => {
    localStorage.setItem('pactopus_wallet', JSON.stringify({ type: 'metamask', address: wallet, network: 'arc' }));
    localStorage.setItem('pactopus_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    document.body?.setAttribute('data-theme', theme);
    window.ethereum = {
      isMetaMask: true,
      on() {},
      removeListener() {},
      async request({ method }: { method: string }) {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [wallet];
        if (method === 'eth_chainId') return '0x4cef52';
        if (method === 'eth_call') return '0x0';
        if (method === 'personal_sign') return '0x' + '11'.repeat(65);
        throw new Error(`Mock wallet forbids ${method}`);
      },
    };
  }, { wallet, theme });
}

for (const theme of ['light', 'dark'] as const) {
  test(`capture create page (${theme})`, async ({ page }: { page: Page }, testInfo: TestInfo) => {
    await setupPageMocks(page, theme);
    await page.goto('/create');
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: `test-results/screenshots/create-${testInfo.project.name}-${theme}.png`,
      fullPage: true,
    });
  });

  test(`capture payment pending page (${theme})`, async ({ page }: { page: Page }, testInfo: TestInfo) => {
    await setupPageMocks(page, theme);
    await page.goto('/pay/fixture-invoice');
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: `test-results/screenshots/pay-pending-${testInfo.project.name}-${theme}.png`,
      fullPage: true,
    });
  });

  test(`capture payment paid page (${theme})`, async ({ page }: { page: Page }, testInfo: TestInfo) => {
    await setupPageMocks(page, theme);
    await page.route('**/api/invoices/fixture-invoice', (route: Route) => route.fulfill({ json: { invoice: invoicePaid } }));
    await page.goto('/pay/fixture-invoice');
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: `test-results/screenshots/pay-paid-${testInfo.project.name}-${theme}.png`,
      fullPage: true,
    });
  });

  test(`capture dashboard page (${theme})`, async ({ page }: { page: Page }, testInfo: TestInfo) => {
    await setupPageMocks(page, theme);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: `test-results/screenshots/dashboard-${testInfo.project.name}-${theme}.png`,
      fullPage: true,
    });
  });

  test(`capture landing & upgrade modal (${theme})`, async ({ page }: { page: Page }, testInfo: TestInfo) => {
    await setupPageMocks(page, theme);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Scroll to pricing
    const pricingSection = page.locator('text=Pick Your Tentacle Tier');
    await pricingSection.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `test-results/screenshots/pricing-${testInfo.project.name}-${theme}.png`,
    });

    // Click upgrade button on Reef Pro to trigger modal
    const proBtn = page.getByRole('button', { name: /Choose The Reef Pro/i });
    if (await proBtn.count() > 0) {
      await proBtn.click();
      await page.waitForSelector('.modal-overlay', { timeout: 5000 }).catch(() => {});
      await page.screenshot({
        path: `test-results/screenshots/upgrade-modal-${testInfo.project.name}-${theme}.png`,
      });
    }
  });
}
