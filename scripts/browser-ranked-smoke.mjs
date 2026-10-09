import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import net from 'node:net'
import path from 'node:path'

const root = process.cwd()
const config = path.join(root, 'wrangler.test.jsonc')
const wrangler = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
const secret = randomBytes(48).toString('hex')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function runNode(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, env, windowsHide: true })
    let output = ''
    child.stdout.on('data', data => { output += String(data) })
    child.stderr.on('data', data => { output += String(data) })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolve(output) : reject(new Error(output.slice(-2000))))
  })
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      server.close(() => resolve(port))
    })
  })
}

async function main() {
  if (!(await fs.stat(path.join(root, 'build', 'index.html')).catch(() => null))) {
    throw new Error('Build static assets before ranked browser smoke: node scripts/build.js')
  }
  const qaRoot = path.join(root, '.wrangler', 'qa')
  await fs.mkdir(qaRoot, { recursive: true })
  const state = await fs.mkdtemp(path.join(qaRoot, 'ranked-state-'))
  const env = { ...process.env, WRANGLER_LOG_PATH: path.join(state, 'wrangler.log'), WRANGLER_SEND_METRICS: 'false' }
  let dev
  let logs = ''
  try {
    await runNode([wrangler, 'd1', 'migrations', 'apply', 'brick-game-test-db', '--local', '--config', config,
      '--persist-to', state], env)
    const port = await freePort()
    const origin = `http://127.0.0.1:${port}`
    dev = spawn(process.execPath, [wrangler, 'dev', '--config', config, '--persist-to', state,
      '--port', String(port), '--var', `SESSION_SECRET:${secret}`, '--show-interactive-dev-session', 'false'],
    { cwd: root, env, windowsHide: true })
    dev.stdout.on('data', data => { logs += String(data) })
    dev.stderr.on('data', data => { logs += String(data) })
    const deadline = Date.now() + 30000
    let ready = false
    while (Date.now() < deadline && dev.exitCode === null) {
      try {
        const response = await fetch(`${origin}/api/health`)
        const health = await response.json()
        if (response.ok && health.ranked === true) { ready = true; break }
      } catch { /* Worker is starting. */ }
      await sleep(150)
    }
    if (!ready) throw new Error(`Isolated Worker failed to start: ${logs.replaceAll(secret, '[redacted]').slice(-1600)}`)
    const result = await runNode([path.join(root, 'scripts', 'browser-smoke.mjs')], {
      ...env, BRICK_SMOKE_URL: origin, BRICK_RANKED_E2E: '1'
    })
    process.stdout.write(result)
  } finally {
    dev?.kill()
    if (dev) await Promise.race([new Promise(resolve => dev.once('exit', resolve)), sleep(2000)])
    const exact = path.resolve(state)
    const approved = path.resolve(qaRoot) + path.sep
    if (!exact.startsWith(approved) || !path.basename(exact).startsWith('ranked-state-')) {
      throw new Error(`Refusing to remove unexpected temporary directory: ${exact}`)
    }
    await fs.rm(exact, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

main().catch(error => {
  console.error(`Ranked browser smoke failed: ${error.message.replaceAll(secret, '[redacted]')}`)
  process.exitCode = 1
})
