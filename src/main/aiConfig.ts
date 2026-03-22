/**
 * Internal AI key provider.
 * This keeps key resolution in one place so renderer/users never provide keys.
 * Set DEEPSEEK_API_KEY in your .env file.
 */
export function getDeepSeekApiKey(): string {
  return process.env.DEEPSEEK_API_KEY || ''
}

