# F0 Foundation Initialization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a runnable local Next.js/TypeScript engineering baseline and verify the delivered SQLite/Prisma schema without implementing product workflows.

**Architecture:** Treat the supplied handoff package directory as the working project root. Keep the supplied Prisma schema and product documents authoritative; add only framework configuration, empty layer directories, an inert boot page, and a secret-free environment template. Do not add routes, product entities, AI calls, database migrations, or training behavior.

**Tech Stack:** Next.js 16, React 19, TypeScript, ESLint flat config, Prettier, Prisma 6 with SQLite, pnpm.

---

### Task 1: Verify the handoff baseline

**Files:**
- Verify: `AGENTS.md`
- Verify: `GOAL.md`
- Verify: `docs/09_SOURCE_MANIFEST.md`
- Verify: `tasks/CURRENT.md`
- Verify: `prisma/schema.prisma`

- [ ] **Step 1: Confirm the supplied stable documents equal their versioned sources**

Run:

```powershell
Get-FileHash docs/09_SOURCE_MANIFEST.md, versioned_sources/09_SOURCE_MANIFEST_v0.8_20260723.md -Algorithm SHA256
```

Expected: matching SHA-256 values.

- [ ] **Step 2: Record the active task without changing it**

Run:

```powershell
Get-Content tasks/CURRENT.md -Encoding UTF8
```

Expected: only `tasks/ITERATION_01/TASK.md` is current; this F0 setup does not advance it.

### Task 2: Add the minimal runnable web baseline

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.json`
- Create: `next-env.d.ts`
- Create: `next.config.ts`
- Create: `eslint.config.mjs`
- Create: `prettier.config.mjs`
- Create: `.prettierignore`
- Create: `.gitignore`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/styles/globals.css`
- Create: `src/components/.gitkeep`
- Create: `src/features/.gitkeep`
- Create: `src/lib/.gitkeep`
- Create: `src/server/.gitkeep`
- Create: `src/ai/.gitkeep`
- Create: `public/.gitkeep`

- [ ] **Step 1: Add framework and tool configuration with scripts for development, build, lint, formatting, typechecking, and Prisma validation**

Configuration rule: pin Next.js and React to the versions verified from the package registry; keep Prisma on its v6 compatibility line because the delivered schema uses the v6-compatible SQLite datasource declaration. In `pnpm-workspace.yaml`, permit only the reviewed Prisma and ESLint resolver build scripts; explicitly deny the unused `sharp` build.

- [ ] **Step 2: Add one inert boot page and required directory placeholders**

The boot page may state that F0 initialization is in progress, but it must not contain navigation, assets, training, forms, database access, AI calls, or product logic.

- [ ] **Step 3: Install the declared dependencies**

Run:

```powershell
pnpm install
```

Expected: `pnpm-lock.yaml` is created and all packages resolve for Node.js 24.

### Task 3: Add environment and validate Prisma

**Files:**
- Create: `.env.example`
- Verify: `prisma/schema.prisma`

- [ ] **Step 1: Add a secret-free local environment template**

Template values:

```dotenv
DATABASE_URL="file:../data/speech-asset-lab.db"
APP_DATA_DIR="./data"
APP_FILES_DIR="./data/files"
APP_LOGS_DIR="./data/logs"
APP_BACKUPS_DIR="./data/backups"
AI_PROVIDER=""
AI_BASE_URL=""
AI_MODEL=""
AI_API_KEY=""
```

- [ ] **Step 2: Run Prisma formatting and validation without changing the delivered model**

Run:

```powershell
$env:DATABASE_URL = "file:../data/speech-asset-lab.db"
pnpm exec prisma format
pnpm exec prisma validate
```

Expected: schema formatting and validation succeed. If either command fails, retain the schema model unchanged and record the exact failure.

### Task 4: Verify the baseline and report F0 setup status

**Files:**
- Verify: `package.json`
- Verify: `src/app/layout.tsx`
- Verify: `src/app/page.tsx`
- Verify: `prisma/schema.prisma`

- [ ] **Step 1: Verify formatting, linting, TypeScript, and production build**

Run:

```powershell
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run build
```

Expected: each command exits with code 0.

- [ ] **Step 2: Verify no prohibited implementation entered the baseline**

Run:

```powershell
rg -n "MediaDevices|microphone|audio|recording|speech recognition|payment|login|authentication" src prisma
```

Expected: no matches.

- [ ] **Step 3: Preserve `tasks/CURRENT.md` and wait for user confirmation**

Do not modify `tasks/CURRENT.md`, create an Iteration result file, or begin Iteration 01. Report the observed stack, directory structure, configuration, database validation, risks, and the suggested next task.

## Self-review

- Coverage: includes every requested F0 setup item while excluding business work and all listed prohibited features.
- Placeholders: none; each command and expected result is explicit.
- Consistency: does not alter the active task or any product/data decision.
