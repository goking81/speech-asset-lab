import { execFile, spawn } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const projectRoot = process.cwd();
const hostname = '127.0.0.1';
const port = readPort(process.env.SPEECH_ASSET_LAB_PORT);
const url = `http://${hostname}:${port}`;
const pidFilePath = path.join(projectRoot, '.speech-asset-lab-server.json');
const nextCliPath = path.join(projectRoot, 'node_modules', 'next', 'dist', 'bin', 'next');

const existing = await readServerRecord();
if (existing && (await isRecordedServer(existing)) && (await canReach(url))) {
  console.log(`Speech Asset Lab 已在运行：${url}`);
  openBrowser(url);
  process.exit(0);
}
if (existing) await rm(pidFilePath, { force: true });
if (await canReach(url)) {
  throw new Error(`端口 ${port} 已被其他本地服务占用；未启动或停止任何进程。`);
}

const server = spawn(
  process.execPath,
  [nextCliPath, 'start', '--hostname', hostname, '--port', String(port)],
  {
    cwd: projectRoot,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  },
);
server.unref();

await writeFile(
  pidFilePath,
  JSON.stringify(
    {
      pid: server.pid,
      projectRoot,
      nextCliPath,
      hostname,
      port,
      startedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
  'utf8',
);

try {
  await waitForServer(url);
  console.log(`Speech Asset Lab 已启动：${url}`);
  openBrowser(url);
} catch (error) {
  await rm(pidFilePath, { force: true });
  server.kill();
  throw error;
}

async function readServerRecord() {
  try {
    const parsed = JSON.parse(await readFile(pidFilePath, 'utf8'));
    if (
      typeof parsed?.pid !== 'number' ||
      parsed.projectRoot !== projectRoot ||
      parsed.hostname !== hostname ||
      parsed.port !== port
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function readPort(value) {
  if (value === undefined || value === '') return 3000;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1024 || parsed > 65535) {
    throw new Error('SPEECH_ASSET_LAB_PORT 必须是 1024—65535 的整数。');
  }
  return parsed;
}

async function waitForServer(targetUrl) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await canReach(targetUrl)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`本地服务在 30 秒内未响应：${targetUrl}`);
}

async function canReach(targetUrl) {
  try {
    return (await fetch(targetUrl)).ok;
  } catch {
    return false;
  }
}

async function isRecordedServer(record) {
  const command = `(Get-CimInstance Win32_Process -Filter 'ProcessId = ${record.pid}').CommandLine`;
  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', command], {
      windowsHide: true,
    });
    return stdout.includes(record.nextCliPath);
  } catch {
    return false;
  }
}

function openBrowser(targetUrl) {
  const browser = spawn('cmd.exe', ['/d', '/c', 'start', '', targetUrl], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  browser.unref();
}
