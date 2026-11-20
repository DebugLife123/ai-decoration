import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = loadEnv('development', root, '');
const backendKeys = /^(CREDIT_GATEWAY_SECRET|JWT_SECRET|SERVER_PORT|CORS_ALLOWED_ORIGINS|APP_UPLOAD_DIR|DATABASE_.*|ADMIN_BOOTSTRAP_.*)$/;
const backendEnv = Object.fromEntries(Object.entries(config).filter(([key]) => backendKeys.test(key)));
const env = {
  ...process.env,
  SERVER_PORT: '8091',
  DATABASE_URL: 'jdbc:postgresql://localhost:55432/decoration',
  ...backendEnv,
};
if (!env.CREDIT_GATEWAY_SECRET || env.CREDIT_GATEWAY_SECRET.length < 32) {
  console.error('Backend not started: set CREDIT_GATEWAY_SECRET (at least 32 characters) in the root .env, matching the AI gateway.');
  process.exit(1);
}
console.log(`Starting backend on port ${env.SERVER_PORT}; credit gateway configuration loaded (secret not logged).`);
const child = spawn(process.platform === 'win32' ? 'mvn.cmd' : 'mvn', ['spring-boot:run'], {
  cwd: fileURLToPath(new URL('../backend/', import.meta.url)),
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
child.on('error', error => { console.error(`Backend launch failed: ${error.message}`); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
