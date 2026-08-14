import { expect, test } from '@playwright/test';

test('local import intake only enables after a collection name and source content are present', async ({
  page,
}) => {
  await page.goto('/content/import');

  const submit = page.getByRole('button', { name: '创建本地导入批次' });
  await expect(submit).toBeDisabled();

  await page.getByLabel('课程集合名称').fill('本地课程');
  await expect(submit).toBeDisabled();

  await page.getByLabel('来源文本').fill('A local source flow.');
  await expect(submit).toBeEnabled();
});
