import { expect, test } from '@playwright/test';

test('candidate review has an explicit source-empty state and no automatic source asset creation', async ({
  page,
}) => {
  await page.goto('/content/jobs/manual-review');

  await expect(page.getByRole('heading', { name: '候选审核', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '当前没有可建立候选的来源段落' })).toBeVisible();
  await expect(page.getByText('解析文档、段落和原文件不会被直接当作来源资产。')).toBeVisible();
  await expect(page.getByRole('link', { name: '导入来源内容' })).toHaveAttribute(
    'href',
    '/content/import',
  );
});
