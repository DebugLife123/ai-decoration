const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> & { DEV?: boolean } }).env;

const configured = env?.VITE_BUSINESS_API_URL?.trim();

/**
 * 后端 API 基地址（不带结尾斜杠）。
 *
 * 1. 构建期注入的 `VITE_BUSINESS_API_URL` 优先 —— docker compose / CI 通过 `--build-arg` 传给前端镜像。
 * 2. `vite dev` 下若未配置，回落到 `http://localhost:8080`，本地开发不用额外设置。
 * 3. 生产构建未注入时返回空串，请求走同源相对路径（需要前置反向代理 `/api` → backend）。
 *
 * 关键：**生产构建绝不回落到 `localhost:8080`**。否则部署到服务器后，浏览器会去请求
 * 访问者自己机器上的 8080，表现为页面能开、登录一直转圈，排查成本极高。
 */
export const apiBaseUrl = (configured || (env?.DEV ? 'http://localhost:8080' : '')).replace(/\/$/, '');

/** 构建期是否显式配置过后端地址。 */
export const apiBaseUrlConfigured = Boolean(configured);

/** 拼接请求地址。 */
export function apiUrl(path: string): string {
  return `${apiBaseUrl}${path}`;
}
