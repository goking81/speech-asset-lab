# Iteration 01 App Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a desktop-first static application shell with clickable primary navigation, deep-linkable settings sections, and automated navigation coverage without database, AI, or business workflows.

**Architecture:** Keep route content static and data-free. Put route and settings metadata in small pure TypeScript modules for unit testing, render the shared shell from a client component that reads the pathname, and make settings links standard hash anchors so URL and keyboard behavior remain native and refresh-safe.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Playwright, ESLint, Prettier.

---

### Task 1: Establish test runners and route metadata

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `src/lib/navigation.ts`
- Create: `src/lib/navigation.test.ts`
- Create: `src/lib/settings-navigation.ts`
- Create: `src/lib/settings-navigation.test.ts`

- [x] **Step 1: Install test dependencies and scripts**

Run:

```powershell
pnpm add -D vitest @playwright/test
```

Add scripts:

```json
"test": "vitest",
"test:run": "vitest run",
"test:e2e": "playwright test"
```

- [x] **Step 2: Write failing route-metadata tests**

```ts
import { expect, test } from 'vitest';
import { primaryNavigation } from './navigation';

test('defines every required primary route once', () => {
  expect(primaryNavigation.map((item) => item.href)).toEqual([
    '/', '/assets', '/practice', '/content', '/graph', '/history', '/profile', '/settings',
  ]);
});
```

Run: `pnpm run test:run`  
Expected: FAIL because navigation metadata does not exist.

- [x] **Step 3: Write failing settings deep-link tests**

```ts
import { expect, test } from 'vitest';
import { settingsSections } from './settings-navigation';

test('defines six unique settings hash targets', () => {
  expect(settingsSections.map((section) => section.id)).toEqual([
    'training', 'ai', 'storage', 'backup', 'privacy', 'experiments',
  ]);
});
```

Run: `pnpm run test:run`  
Expected: FAIL because settings metadata does not exist.

- [x] **Step 4: Implement the minimal typed metadata and test configuration**

Implement route and settings arrays as `as const`; configure Vitest for `src/**/*.test.ts` and Playwright with a local `pnpm dev` web server.

- [x] **Step 5: Verify unit tests pass**

Run: `pnpm run test:run`  
Expected: 2 passing tests.

### Task 2: Render the shared shell and static route pages

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`
- Create: `src/app/assets/page.tsx`
- Create: `src/app/practice/page.tsx`
- Create: `src/app/content/page.tsx`
- Create: `src/app/graph/page.tsx`
- Create: `src/app/history/page.tsx`
- Create: `src/app/profile/page.tsx`
- Create: `src/components/app-shell.tsx`
- Create: `src/components/empty-state.tsx`
- Create: `src/components/status-strip.tsx`
- Create: `src/features/placeholder-page.tsx`
- Modify: `src/styles/globals.css`

- [x] **Step 1: Add shared shell components**

The shell must render the eight metadata-backed links, expose the active route with `aria-current="page"`, show AI unconfigured and locally saved statuses, and use the existing Slate / Blue-Green tokens.

- [x] **Step 2: Add route-specific static placeholders**

Each route must render a distinct heading and an explicit static empty state. `/graph` and `/profile` must state that the feature is not yet available, rather than render a dead control.

- [x] **Step 3: Keep the desktop layout usable at 1024px**

Use a 252px sidebar, a 56px header, visible focus rings, and a content grid that remains readable at 1024px. Do not add mobile navigation, microphone UI, forms, data access, or AI calls.

### Task 3: Implement settings navigation and error state

**Files:**
- Create: `src/app/settings/page.tsx`
- Create: `src/app/error.tsx`
- Create: `src/features/settings/settings-page.tsx`
- Modify: `src/styles/globals.css`

- [x] **Step 1: Render accessible settings hash navigation**

Render six `<a href="#…">` links and matching `<section id="…" tabIndex={-1}>` content. Each section must contain static explanatory content; experiments must show “当前版本暂无实验功能”.

- [x] **Step 2: Add an error boundary UI**

Implement Next.js `error.tsx` as a client component with a retry button and a non-technical fallback message. It must not expose secrets or stack traces.

### Task 4: Add E2E coverage and visual QA

**Files:**
- Create: `tests/e2e/navigation.spec.ts`

- [x] **Step 1: Write E2E cases before implementation is considered complete**

```ts
test('settings deep link selects the experiments section', async ({ page }) => {
  await page.goto('/settings#experiments');
  await expect(page.getByRole('heading', { name: '实验功能' })).toBeVisible();
  await expect(page.getByText('当前版本暂无实验功能')).toBeVisible();
});
```

Add coverage for all eight primary navigation links, keyboard Tab focus, refresh-safe settings hash behavior, and the 1024px desktop layout.

- [x] **Step 2: Install the Playwright Chromium runtime and execute E2E**

Run:

```powershell
pnpm exec playwright install chromium
pnpm run test:e2e
```

Expected: all navigation and settings tests pass.

- [x] **Step 3: Perform browser QA**

Verify: `/` renders meaningful content; `/settings#experiments` displays the correct section; no framework overlay or console errors; primary navigation changes route; screenshot desktop widths 1280px and 1024px.

### Task 5: Verify and hand off Iteration 01

**Files:**
- Create: `RESULT.md`

- [x] **Step 1: Run all verification commands**

```powershell
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test:run
pnpm run test:e2e
pnpm run build
```

- [x] **Step 2: Write `RESULT.md`**

Record changed files, no data migration, automated results, browser QA, no deviations, unresolved risks, and the recommendation to wait for review. Do not update `tasks/CURRENT.md` or start Iteration 02.
