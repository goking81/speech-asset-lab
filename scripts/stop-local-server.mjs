import { execFile } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const projectRoot = process.cwd();
const pidFilePath = `${projectRoot}\\.speech-asset-lab-server.json`;

let record;
try {
  record = JSON.parse(await readFile(pidFilePath, 'utf8'));
} catch {
  console.log('没有找到由 start-local.bat 启动的 Speech Asset Lab 服务。');
  process.exit(0);
}

if (
  typeof record?.pid !== 'number' ||
  record.projectRoot !== projectRoot ||
  typeof record.nextCliPath !== 'string'
) {
  await rm(pidFilePath, { force: true });
  throw new Error('本地服务记录无效；未停止任何进程。');
}

const commandLine = await readCommandLine(record.pid);
if (!commandLine || !commandLine.includes(record.nextCliPath)) {
  await rm(pidFilePath, { force: true });
  throw new Error('记录中的进程不再属于当前项目；未停止任何进程。');
}

try {
  await execFileAsync('taskkill.exe', ['/PID', String(record.pid), '/T', '/F'], {
    windowsHide: true,
  });
  console.log('Speech Asset Lab 本地服务已停止。');
} finally {
  await rm(pidFilePath, { force: true });
}

async function readCommandLine(pid) {
  const command = `(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}').CommandLine`;
  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', command], {
      windowsHide: true,
    });
    return stdout.trim();
  } catch {
    return '';
  }
}
