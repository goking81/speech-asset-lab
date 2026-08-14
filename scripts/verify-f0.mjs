import { spawnSync } from 'node:child_process';

const packageRunner = 'pnpm';
const checks = [
  ['run', 'prisma:format'],
  ['run', 'prisma:validate'],
  ['run', 'prisma:generate'],
  ['run', 'db:setup'],
  ['run', 'format:check'],
  ['run', 'lint'],
  ['run', 'typecheck'],
  ['run', 'test:run'],
  ['run', 'test:e2e'],
  ['run', 'build'],
  ['run', 'verify:cold-start'],
];

for (const args of checks) {
  const result = spawnSync(packageRunner, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error || result.status !== 0) {
    if (result.error) {
      console.error(`F0 门禁命令无法启动：${args.join(' ')}`);
    }
    process.exit(result.status ?? 1);
  }
}

console.log('F0 发布门禁通过。');
