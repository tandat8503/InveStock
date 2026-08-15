import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const results = []
const check = (name, condition, details = '') => results.push({ name, pass: Boolean(condition), details })
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const walk = (directory, output = []) => {
  if (!fs.existsSync(directory)) return output
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    entry.isDirectory() ? walk(target, output) : output.push(target)
  }
  return output
}

const packageJson = JSON.parse(read('package.json'))
for (const file of [
  'scripts/check-command-contract.mjs',
  'scripts/verify-release-state.mjs',
  'src-tauri/build.rs',
  'eslint.config.js',
  '.gitignore',
  'vitest.config.ts',
  'legacy-seed.example.json',
  'src-tauri/tests/fixtures/legacy-inventory-fixture.json',
]) {
  check(`Release file tồn tại: ${file}`, fs.existsSync(path.join(root, file)))
}
const sourceFiles = walk(path.join(root, 'src')).filter(file => /\.(ts|tsx)$/.test(file))
const source = sourceFiles.map(file => fs.readFileSync(file, 'utf8')).join('\n')
const commandIndex = read('src/lib/commands/index.ts')
const commandImports = new Map(
  [...commandIndex.matchAll(/import\s+\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\s+from\s+['"]\.\/([^'"]+)['"]/g)]
    .map(match => [match[1], `src/lib/commands/${match[2]}.ts`]),
)
const commandExportBlock = commandIndex.match(/export\s+const\s+appCommands\s*=\s*\{([\s\S]*?)\}\s*as\s+const/)?.[1] ?? ''
const activeCommandFiles = commandExportBlock
  .split(',')
  .map(entry => entry.trim().split(':').at(-1)?.trim())
  .filter(Boolean)
  .map(symbol => commandImports.get(symbol))
  .filter(Boolean)
const activeCommandSource = activeCommandFiles.map(read).join('\n')
const productionTests = walk(path.join(root, 'tests'))
  .filter(file => /\.(ts|tsx)$/.test(file) && !file.includes(`${path.sep}legacy-electron${path.sep}`))
const testSource = productionTests.map(file => fs.readFileSync(file, 'utf8')).join('\n')
const forbiddenPackages = [
  'electron', 'electron-builder', 'electron-vite', '@electron-toolkit/preload',
  '@electron-toolkit/tsconfig', '@electron-toolkit/utils',
]
const installedForbidden = forbiddenPackages.filter(name => packageJson.dependencies?.[name] || packageJson.devDependencies?.[name])
check('Production không dùng window.electronAPI', !/window\.electronAPI|\(window as any\)\.electronAPI/.test(source))
check('electronCompatBridge không được import', !/electronCompatBridge/.test(source))
check('Không còn Electron runtime dependency', installedForbidden.length === 0, installedForbidden.join(', '))
check('Default tests không import electron/', !/from\s+['"][^'"]*electron\/|require\(['"][^'"]*electron\//.test(testSource))
check('_electron.launch chỉ nằm trong legacy archive', !/_electron\.launch\s*\(/.test(testSource))
check('Typed modules production không rỗng', activeCommandFiles.length > 0 && !/export const \w+\s*=\s*\{\s*\}/s.test(activeCommandSource))

const cargoVersion = read('src-tauri/Cargo.toml').match(/^version\s*=\s*"([^"]+)"/m)?.[1]
const tauriVersion = JSON.parse(read('src-tauri/tauri.conf.json')).version
check('Version package/Cargo/Tauri đồng bộ', packageJson.version === cargoVersion && packageJson.version === tauriVersion,
  `${packageJson.version} / ${cargoVersion} / ${tauriVersion}`)
const releaseRegistry = read('src-tauri/src/lib.rs')
  .match(/#\[cfg\(not\([\s\S]*?generate_handler!\[([\s\S]*?)\]\);/)?.[1] ?? ''
check('Release registry không chứa seed_demo_data', !/seed_demo_data|get_db_stats/.test(releaseRegistry))
check('Production không chứa mock backup data', !/mockBackup|mock_backup|fakeBackup|fake_backup/.test(source))
check('package.json không có Electron main/dev script', !packageJson.main && !packageJson.scripts?.['dev:electron'])

const isReleaseSource = !fs.existsSync(path.join(root, '.git'))
if (isReleaseSource) {
  check('Release source không chứa private-data/', !fs.existsSync(path.join(root, 'private-data')))
}

const obviousRealFiles = walk(root).filter(file => {
  const rel = path.relative(root, file)
  const parts = rel.split(path.sep)
  if (parts.includes('node_modules') || parts.includes('target') || rel.startsWith('src-tauri' + path.sep + 'target')) {
    return false
  }
  if (rel === 'legacy-seed.example.json' || rel.startsWith('src-tauri' + path.sep + 'tests')) {
    return false
  }
  if (!isReleaseSource && parts.includes('private-data')) {
    return false
  }
  const name = path.basename(file).toLowerCase()
  if (name.endsWith('.xls') || name.endsWith('.xlsx')) return true
  if (name.endsWith('.json') && (/nxtgui/i.test(name) || /customer.*seed/i.test(name))) return true
  return false
})
check('Không chứa dữ liệu thực tế của khách hàng (XLS/XLSX/customer-seed-JSON)', obviousRealFiles.length === 0, obviousRealFiles.join(', '))


const contract = spawnSync(process.execPath, ['scripts/check-command-contract.mjs'], { cwd: root, encoding: 'utf8' })
check('Command contract', contract.status === 0, contract.stderr.trim())

for (const result of results) {
  console.log(`${result.pass ? 'PASS' : 'FAIL'} | ${result.name}${result.details ? ` | ${result.details}` : ''}`)
}
if (results.some(result => !result.pass)) process.exit(1)
console.log(`Release state PASS: ${results.length}/${results.length} checks.`)
