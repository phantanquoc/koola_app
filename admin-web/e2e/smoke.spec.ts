import { test, expect } from '@playwright/test';

/**
 * Smoke: login → dashboard. Chạy với backend + admin-web dev đang chạy:
 *   ADMIN_URL=http://localhost:5173 ADMIN_EMAIL=... ADMIN_PASSWORD=... npx playwright test
 */
const baseURL = process.env.ADMIN_URL ?? 'http://localhost:5173';
const email = process.env.ADMIN_EMAIL ?? '';
const password = process.env.ADMIN_PASSWORD ?? '';

test.describe('admin smoke', () => {
  test.skip(!email || !password, 'Thiếu ADMIN_EMAIL/ADMIN_PASSWORD — bỏ qua smoke cần backend thật');

  test('login → dashboard hiện KPI', async ({ page }) => {
    await page.goto(`${baseURL}/login`);
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/mật khẩu|password/i).fill(password);
    await page.getByRole('button', { name: /đăng nhập|login/i }).click();
    await expect(page).toHaveURL(new RegExp(`${baseURL}/?`));
    await expect(page.getByText(/tổng quan vận hành/i).first()).toBeVisible({ timeout: 15000 });
  });
});
