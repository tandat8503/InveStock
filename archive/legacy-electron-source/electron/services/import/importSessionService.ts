import type { ImportSession } from './importModels'

export class ImportSessionService {
  private readonly sessions = new Map<string, ImportSession>()

  constructor(
    private readonly ttlMilliseconds = 30 * 60_000,
    private readonly maximumSessions = 20
  ) {}

  create(session: Omit<ImportSession, 'createdAt' | 'expiresAt'>): ImportSession {
    this.cleanupExpired()
    while (this.sessions.size >= this.maximumSessions) {
      const oldest = [...this.sessions.values()].sort((a, b) => a.createdAt - b.createdAt)[0]
      if (!oldest) break
      this.sessions.delete(oldest.id)
    }
    const createdAt = Date.now()
    const complete = {
      ...session,
      createdAt,
      expiresAt: createdAt + this.ttlMilliseconds,
    }
    this.sessions.set(complete.id, complete)
    return complete
  }

  get(id: string): ImportSession {
    this.cleanupExpired()
    const session = this.sessions.get(id)
    if (!session) throw new Error('Phiên import không tồn tại hoặc đã hết hạn')
    return session
  }

  cancel(id: string): boolean {
    return this.sessions.delete(id)
  }

  cleanupExpired(now = Date.now()): number {
    let removed = 0
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= now) {
        this.sessions.delete(id)
        removed += 1
      }
    }
    return removed
  }

  get size(): number {
    this.cleanupExpired()
    return this.sessions.size
  }
}

export const importSessionService = new ImportSessionService()
