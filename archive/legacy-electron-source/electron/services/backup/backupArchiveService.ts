import fs from 'fs'
import archiver from 'archiver'

export async function zipBackupDirectory(source: string, destination: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(destination, { flags: 'wx' })
    const archive = archiver('zip', { zlib: { level: 9 } })
    output.on('close', resolve)
    output.on('error', reject)
    archive.on('error', reject)
    archive.pipe(output)
    archive.directory(source, false)
    void archive.finalize()
  })
}
