import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const commandDir = path.join(root, 'src/lib/commands')
const errors = []
const commandOwners = new Map()
const indexSource = fs.readFileSync(path.join(commandDir, 'index.ts'), 'utf8')
const imports = new Map(
  [...indexSource.matchAll(/import\s+\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\s+from\s+['"]\.\/([^'"]+)['"]/g)]
    .map(match => [match[1], `${match[2]}.ts`]),
)
const exportBlock = indexSource.match(/export\s+const\s+appCommands\s*=\s*\{([\s\S]*?)\}\s*as\s+const/)
if (!exportBlock) {
  console.error('Không parse được appCommands trong src/lib/commands/index.ts')
  process.exit(1)
}
const exportedSymbols = new Set()
for (const entry of exportBlock[1].split(',')) {
  const value = entry.trim().split(':').at(-1)?.trim()
  if (value) exportedSymbols.add(value)
}
const activeFiles = new Set()
for (const symbol of exportedSymbols) {
  const file = imports.get(symbol)
  if (!file) errors.push(`Không tìm thấy import cho appCommands export: ${symbol}`)
  else activeFiles.add(file)
}

for (const entry of fs.readdirSync(commandDir, { withFileTypes: true })) {
  if (!entry.isFile() || !activeFiles.has(entry.name)) continue
  const file = path.join(commandDir, entry.name)
  const source = fs.readFileSync(file, 'utf8')
  if (/export const \w+\s*=\s*\{\s*\}/s.test(source)) {
    errors.push(`Typed module rỗng: ${path.relative(root, file)}`)
  }
  for (const match of source.matchAll(/\bcommand(?:<[^;()]*>)?\(\s*['"]([^'"]+)['"]/g)) {
    const commandName = match[1]
    const owners = commandOwners.get(commandName) ?? new Set()
    owners.add(path.relative(commandDir, file))
    commandOwners.set(commandName, owners)
  }
}

const rust = fs.readFileSync(path.join(root, 'src-tauri/src/lib.rs'), 'utf8')
const handlerBlocks = [...rust.matchAll(/#\[cfg\(([^\]]+)\)\][\s\S]*?invoke_handler\(tauri::generate_handler!\[([\s\S]*?)\]\);/g)]
const release = handlerBlocks.find(match => match[1].startsWith('not('))
const debug = handlerBlocks.find(match => !match[1].startsWith('not('))
if (!release) errors.push('Không parse được release tauri::generate_handler!')

const parseHandlers = block => (block?.[2].match(/\b[a-z][a-z0-9_]+\b/g) ?? [])
const releaseList = parseHandlers(release)
const debugList = parseHandlers(debug)
const releaseHandlers = new Set(releaseList)
const debugOnly = new Set(debugList.filter(name => !releaseHandlers.has(name)))
for (const name of new Set(releaseList.filter((name, index) => releaseList.indexOf(name) !== index))) {
  errors.push(`Rust release handler bị đăng ký trùng: ${name}`)
}
for (const [name, owners] of commandOwners) {
  if (owners.size > 1) errors.push(`Command ${name} xuất hiện ở nhiều typed module: ${[...owners].join(', ')}`)
  if (!releaseHandlers.has(name)) {
    errors.push(debugOnly.has(name)
      ? `Production frontend gọi debug-only command: ${name}`
      : `Typed frontend thiếu Rust release handler: ${name}`)
  }
}

const rows = [...commandOwners.keys()].sort().map(name => ({
  frontend: name,
  backend: releaseHandlers.has(name) ? name : debugOnly.has(name) ? `${name} (debug)` : '—',
  status: releaseHandlers.has(name) ? 'PASS' : 'FAIL',
}))
const widths = [
  Math.max('Typed production command'.length, ...rows.map(row => row.frontend.length)),
  Math.max('Rust release handler'.length, ...rows.map(row => row.backend.length)),
]
console.log(`${'Typed production command'.padEnd(widths[0])} | ${'Rust release handler'.padEnd(widths[1])} | Status`)
console.log(`${'-'.repeat(widths[0])}-+-${'-'.repeat(widths[1])}-+-------`)
for (const row of rows) console.log(`${row.frontend.padEnd(widths[0])} | ${row.backend.padEnd(widths[1])} | ${row.status}`)

if (errors.length) {
  console.error(`\nCommand contract FAIL (${errors.length})\n${errors.map(error => `- ${error}`).join('\n')}`)
  process.exit(1)
}
console.log(`\nCommand contract PASS: ${rows.length} typed commands, ${releaseHandlers.size} release handlers.`)
