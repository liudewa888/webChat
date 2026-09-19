// 本地打包部署:node pack.mjs(在 npm run build 之后)
// 产出 deploy/ 目录 + webChat.tar.gz,整个上传到服务器解压即可 pm2 启动
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = import.meta.dirname ?? process.cwd()
const out = path.join(root, 'deploy')

fs.rmSync(out, { recursive: true, force: true })

// 1. 定位 standalone 中的应用根(server.js 所在目录;Next 可能按工程路径嵌套一层)
function findAppRoot(dir) {
  if (fs.existsSync(path.join(dir, 'server.js'))) return dir
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue
    const hit = findAppRoot(path.join(dir, e.name))
    if (hit) return hit
  }
  return null
}
const appRoot = findAppRoot(path.join(root, '.next/standalone'))
if (!appRoot) {
  console.error('✗ 未在 .next/standalone 找到 server.js,请先执行 npm run build')
  process.exit(1)
}
fs.cpSync(appRoot, out, { recursive: true })
// 2. 静态资源放到应用根的 .next/static 下(standalone 约定路径)
fs.cpSync(path.join(root, '.next/static'), path.join(out, '.next/static'), { recursive: true })
// 3. public 资源
fs.cpSync(path.join(root, 'public'), path.join(out, 'public'), { recursive: true })
fs.mkdirSync(path.join(out, 'logs'), { recursive: true })

// 4. 生成 pm2 配置(单实例 fork:SSE/房间状态在本进程内存,勿 cluster)
fs.writeFileSync(
  path.join(out, 'ecosystem.config.js'),
  `// 单实例 fork 模式,勿改 cluster —— 房间状态与 SSE 连接都在本进程内存
module.exports = {
  apps: [
    {
      name: 'webChat',
      script: 'server.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      // 中转/归档文件由代码写在 进程工作目录/tmp(=此处 cwd),故 cwd 必须是部署根目录
      env: { NODE_ENV: 'production', PORT: 3000, HOSTNAME: '127.0.0.1' },
      max_memory_restart: '600M',
      out_file: 'logs/out.log',
      error_file: 'logs/err.log',
      merge_logs: true,
      time: true,
    },
  ],
}
`,
)

const tarball = path.join(root, 'webChat.tar.gz')
fs.rmSync(tarball, { force: true })
execSync(`tar -czf webChat.tar.gz -C deploy .`, { cwd: root, stdio: 'inherit' })

const size = (fs.statSync(tarball).size / 1024 / 1024).toFixed(1)
console.log(`\n✓ 打包完成:deploy/ 目录,webChat.tar.gz(${size} MB)`)
console.log('  上传后服务器执行:tar xzf webChat.tar.gz -C next')
