import { type ChildProcess, spawn } from 'node:child_process';

export interface StaticServer {
  origin: string;
  stop: () => void;
}

export async function startStaticServer(port: number): Promise<StaticServer> {
  const child: ChildProcess = spawn(
    process.execPath,
    ['--import', 'tsx', 'scripts/serve-dist.ts'],
    {
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'inherit'],
    },
  );
  await new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.stdout?.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes('serving')) {
        resolve();
      }
    });
    child.once('exit', (code) => {
      reject(new Error(`static server exited with code ${String(code)}`));
    });
  });
  return {
    origin: `http://127.0.0.1:${String(port)}`,
    stop: () => {
      child.kill();
    },
  };
}
