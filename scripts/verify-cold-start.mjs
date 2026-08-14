import { spawn } from 'node:child_process';

const hostname = '127.0.0.1';
const port = '3101';
const url = `http://${hostname}:${port}/`;
const server = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '--hostname', hostname, '--port', port],
  { cwd: process.cwd(), stdio: 'pipe' },
);

const output = [];
server.stdout.on('data', (chunk) => output.push(chunk.toString()));
server.stderr.on('data', (chunk) => output.push(chunk.toString()));

async function waitForHomePage() {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`生产服务器提前退出：${output.join('').trim()}`);
    }

    try {
      const response = await fetch(url);

      if (response.ok) {
        return;
      }
    } catch {
      // 服务器仍在启动，继续等待。
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`生产服务器在 30 秒内未响应：${output.join('').trim()}`);
}

try {
  await waitForHomePage();
  console.log(`冷启动通过：${url}`);
} finally {
  server.kill();
}
