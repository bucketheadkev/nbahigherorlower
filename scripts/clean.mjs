import { execSync } from 'child_process';
import { rmSync } from 'fs';
import path from 'path';
import { platform } from 'os';

function stopDevServerOnPort(port) {
  try {
    if (platform() === 'win32') {
      execSync(
        `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"`,
        { stdio: 'ignore' },
      );
      // Allow Windows to release file handles on .next
      execSync('powershell -NoProfile -Command "Start-Sleep -Seconds 2"', { stdio: 'ignore' });
    } else {
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, {
        stdio: 'ignore',
        shell: true,
      });
    }
  } catch {
    // No process on port — safe to continue.
  }
}

function removeDir(target) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      console.log(`Removed ${path.basename(target)} cache`);
      return;
    } catch (error) {
      if (attempt === 2) {
        console.warn(`Could not remove ${target}:`, error);
        return;
      }
      if (platform() === 'win32') {
        execSync('powershell -NoProfile -Command "Start-Sleep -Milliseconds 500"', {
          stdio: 'ignore',
        });
      }
    }
  }
}

const port = Number(process.env.PORT ?? 3000);
stopDevServerOnPort(port);

const targets = [
  path.join(process.cwd(), '.next'),
  path.join(process.cwd(), 'node_modules', '.cache'),
];

for (const target of targets) {
  removeDir(target);
}
