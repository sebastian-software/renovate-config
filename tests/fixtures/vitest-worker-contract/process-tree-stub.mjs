// Harmless long-lived descendant retaining inherited stdout/stderr.
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
if (process.argv.includes('--grandchild')) {
  await writeFile('grandchild-ready.txt', String(process.pid));
  setTimeout(() => writeFile('late-marker.txt', 'survived deadline\n'), 5000);
  setInterval(() => {}, 1000);
} else {
  const child = spawn(process.execPath, [process.argv[1], '--grandchild'], { stdio: ['ignore', 'inherit', 'inherit'] });
  await writeFile('owned-pids.json', JSON.stringify({ parent: process.pid, grandchild: child.pid }));
  // Let the real parent reap its descendant before exiting on group SIGTERM.
  process.on('SIGTERM', () => { child.once('exit', () => process.exit(0)); });
  setInterval(() => {}, 1000);
}
