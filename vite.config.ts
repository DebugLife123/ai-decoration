import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { createAiGatewayPlugin } from './server/aiGateway.js'

const aiEnvKeys = ['CODEX2API_API_KEY', 'AI_BASE_URL', 'AI_VISION_MODEL', 'AI_IMAGE_MODEL', 'AI_API_KEY', 'AI_MODEL', 'IMAGE_MODEL']

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
  return {
    plugins: [react(), createAiGatewayPlugin(loadedEnv)],
    preview: { allowedHosts: ['www.openai2api.com'] },
  }
})
