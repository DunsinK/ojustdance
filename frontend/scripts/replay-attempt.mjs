import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { parseAttempt } from '../.keyframe-tests/attempts/validation.js'
import { ATTEMPT_LIMITS } from '../.keyframe-tests/attempts/contracts.js'
import { replayAttempt } from '../.keyframe-tests/attempts/replay.js'
import { implementationId } from '../.keyframe-tests/attempts/implementationId.js'

const [input, output] = process.argv.slice(2)
if (!input) {
  console.error('Usage: npm run replay:attempt -- attempt.json [new-comparison.json]')
  process.exitCode = 1
} else {
  try {
    if (output && resolve(output) === resolve(input)) throw new Error('Output must not replace the original recording')
    if ((await stat(input)).size > ATTEMPT_LIMITS.bytes) throw new Error('Attempt file exceeds 128 MB')
    const attempt = parseAttempt(await readFile(input, 'utf8'))
    const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..')
    const sources = {}
    async function collect(directory, recursive) {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name)
        if (entry.isDirectory() && recursive) await collect(path, true)
        else if (entry.isFile() && path.endsWith('.ts')) sources[relative(resolve(frontend, 'src/attempts'), path).split(sep).join('/')] = await readFile(path, 'utf8')
      }
    }
    await collect(resolve(frontend, 'src/scoring'), false)
    await collect(resolve(frontend, '../shared/skeleton/src'), true)
    const evaluation = await replayAttempt(attempt, {
      id: randomUUID(), createdAt: new Date().toISOString(), label: 'Command-line replay', implementationId: await implementationId(sources),
    })
    if (output) await writeFile(output, JSON.stringify(evaluation, null, 2), { flag: 'wx' })
    console.log(JSON.stringify({ attemptId: attempt.id, originalScore: attempt.original.result.score,
      replayScore: evaluation.result.score, difference: evaluation.result.score - attempt.original.result.score,
      originalImplementation: attempt.original.implementationId, replayImplementation: evaluation.implementationId,
      ...(output ? { comparisonFile: resolve(output) } : {}),
    }, null, 2))
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
