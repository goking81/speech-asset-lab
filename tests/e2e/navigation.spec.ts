import { expect, test } from '@playwright/test';

const primaryRoutes = [
  { href: '/', label: '今日训练', heading: '今日训练' },
  { href: '/assets', label: '资产库', heading: '资产库' },
  { href: '/practice', label: '问题训练', heading: '问题训练' },
  { href: '/content', label: '内容工作台', heading: '内容工作台' },
  { href: '/graph', label: '关系图谱', heading: '关系图谱' },
  { href: '/history', label: '训练记录', heading: '训练记录' },
  { href: '/profile', label: '关于我', heading: '关于我' },
  { href: '/settings', label: '设置', heading: '设置' },
];

test('every primary navigation link opens its corresponding route', async ({ page }) => {
  await page.goto('/');

  for (const route of primaryRoutes) {
    await page.getByRole('link', { name: route.label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${route.href === '/' ? '/$' : `${route.href}$`}`));
    await expect(page.getByRole('heading', { name: route.heading, level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: route.label, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
  }
});

test('primary navigation is reachable with the keyboard', async ({ page }) => {
  await page.goto('/');

  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');

  await expect(page.getByRole('link', { name: '今日训练', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/$/);
});

test('settings deep link selects the experiments section after refresh', async ({ page }) => {
  await page.goto('/settings#experiments');
  await expect(page.getByRole('heading', { name: '实验功能' })).toBeVisible();
  await expect(page.getByText('当前版本暂无实验功能')).toBeVisible();
  await expect(page.getByRole('link', { name: '实验功能', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await page.reload();
  await expect(page).toHaveURL(/\/settings#experiments$/);
  await expect(page.getByRole('link', { name: '实验功能', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('the desktop shell remains available at 1024px', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');

  await expect(page.locator('.app-shell__sidebar')).toBeVisible();
  await expect(page.locator('.status-strip')).toBeVisible();
  await expect(page.getByRole('heading', { name: '今日训练', level: 1 })).toBeVisible();
  await expect(page.locator('.app-shell__sidebar')).toHaveCSS('width', '252px');
});
