import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { createAiGatewayPlugin } from './server/aiGateway.js'
import { createCadWorkflowMiddleware } from './server/cadWorkflow.js'
import { createBackendProxyPlugin } from './server/backendProxy.js'
import { resolve } from 'node:path'

const aiEnvKeys = ['CODEX2API_API_KEY', 'AI_IMAGE_API_KEY', 'AI_BASE_URL', 'AI_VISION_MODEL', 'AI_IMAGE_MODEL', 'AI_API_KEY', 'AI_MODEL', 'IMAGE_MODEL', 'AI_ANALYSIS_TIMEOUT_MS', 'AI_REVIEW_TIMEOUT_MS', 'AI_IMAGE_TIMEOUT_MS']

export default defineConfig(() => {
  const env = process.env as Record<string, string | undefined>
  const inheritedEnv = { ...env }
  for (const key of aiEnvKeys) delete process.env[key]
  const fileEnv = loadEnv('', process.cwd(), '')
  Object.assign(process.env, inheritedEnv)
  const loadedEnv: Record<string, string> = Object.fromEntries(Object.entries(inheritedEnv).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  for (const key of aiEnvKeys) {
    if (typeof fileEnv[key] === 'string') loadedEnv[key] = fileEnv[key]
  }
  const configuredTimeout = (name: string, fallback: number) => {
    const value = Number(loadedEnv[name])
    return Number.isFinite(value) && value >= 10000 && value <= 600000 ? value : fallback
  }
  const cadGatewayConfig = {
    baseUrl: loadedEnv.AI_BASE_URL || 'https://codex2api.com',
    apiKey: loadedEnv.CODEX2API_API_KEY || loadedEnv.AI_API_KEY || '',
    imageApiKey: loadedEnv.AI_IMAGE_API_KEY,
    visionModel: loadedEnv.AI_VISION_MODEL || loadedEnv.AI_MODEL || 'gpt-6.1-sol',
    imageModel: loadedEnv.AI_IMAGE_MODEL || loadedEnv.IMAGE_MODEL || 'gpt-image-1',
    analysisTimeoutMs: configuredTimeout('AI_ANALYSIS_TIMEOUT_MS', 90000),
    reviewTimeoutMs: configuredTimeout('AI_REVIEW_TIMEOUT_MS', 90000),
    imageTimeoutMs: configuredTimeout('AI_IMAGE_TIMEOUT_MS', 180000),
  }
  return {
    resolve: { dedupe: ['react', 'react-dom'] },
    server: { fs: { allow: [process.cwd(), resolve(process.cwd(), 'packages/canvas')] } },
    plugins: [react(), createAiGatewayPlugin(loadedEnv), createBackendProxyPlugin(loadedEnv.BACKEND_URL || 'http://127.0.0.1:8091'), { name: 'cad-workflow', configureServer(server) { server.middlewares.use('/api/cad', createCadWorkflowMiddleware(cadGatewayConfig)) }, configurePreviewServer(server) { server.middlewares.use('/api/cad', createCadWorkflowMiddleware(cadGatewayConfig)) } }],
    preview: {
      allowedHosts: ['openai2api.com', 'www.openai2api.com'],
      cors: {
        origin: [
          'http://openai2api.com:4175',
          'https://openai2api.com:4175',
          'http://www.openai2api.com:4175',
          'https://www.openai2api.com:4175',
        ],
      },
    },
  }
})
