import { execFile } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

export interface PythonExecResult {
  stdout: string
  stderr: string
  exitCode: number | null
}

const MAX_OUTPUT_CHARS = 8000

export async function runPython(code: string, timeoutMs = 25000): Promise<PythonExecResult> {
  const dir = await mkdtemp(path.join(tmpdir(), 'puppeteer-python-'))
  const filePath = path.join(dir, 'main.py')
  await writeFile(filePath, code, 'utf8')

  try {
    return await new Promise<PythonExecResult>((resolve) => {
      let settled = false
      const finish = (res: PythonExecResult) => {
        if (settled) return
        settled = true
        resolve(res)
      }

      const child = execFile('python3', ['-u', filePath], { timeout: timeoutMs }, (err, stdout, stderr) => {
        const exitCode = err ? (typeof (err as { code?: number } | null)?.code === 'number' ? (err as { code?: number }).code ?? null : null) : 0
        finish({
          stdout: String(stdout || '').slice(0, MAX_OUTPUT_CHARS),
          stderr: String(stderr || '').slice(0, MAX_OUTPUT_CHARS),
          exitCode,
        })
      })

      child.on('error', () => {
        finish({ stdout: '', stderr: 'python3 not available', exitCode: null })
      })
    })
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
