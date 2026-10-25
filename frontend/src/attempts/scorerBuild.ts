import { implementationId } from './implementationId'

// Raw source imports update with Vite/HMR. Hash the scoring code, not secrets or the whole repository.
const sources = {
  ...import.meta.glob<string>('../scoring/*.ts', { eager: true, query: '?raw', import: 'default' }),
  ...import.meta.glob<string>('../../../shared/skeleton/src/**/*.ts', { eager: true, query: '?raw', import: 'default' }),
}
export async function scorerImplementationId(): Promise<string> {
  return implementationId(sources)
}
