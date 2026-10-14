import twitterText from 'twitter-text';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

export function validatePost(text: string) {
  const normalized = text.normalize('NFC');
  const parsed = twitterText.parseTweet(normalized);
  if (!parsed.valid || !normalized.trim()) throw new Error('Post must fit the X weighted 280-character limit.');
  return { text: normalized, weightedLength: parsed.weightedLength, remaining: 280 - parsed.weightedLength };
}

export type PublishedPost = { id: string; url: string };
type PostRow = { digest: string; status: string; post_id: string | null };

/** Durable write-ahead record: uncertain posts require reconciliation, never an automatic retry. */
export class PostJournal {
  db: DatabaseSync;
  constructor(file: string) {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(file);
    chmodSync(file, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS posts(job_id TEXT PRIMARY KEY, digest TEXT NOT NULL, status TEXT NOT NULL, post_id TEXT);`);
  }
  get(jobId: string) { return this.db.prepare('SELECT * FROM posts WHERE job_id=?').get(jobId) as PostRow | undefined; }
  reserve(jobId: string, digest: string) {
    this.db.prepare("INSERT INTO posts(job_id,digest,status) VALUES(?,?,'unknown')").run(jobId, digest);
  }
  complete(jobId: string, id: string) {
    this.db.prepare("UPDATE posts SET status='published',post_id=? WHERE job_id=?").run(id, jobId);
  }
  close() { this.db.close(); }
}

export class XPublisher {
  constructor(private accessToken: string, private expectedUserId: string, private journal: PostJournal,
              private request: typeof fetch = fetch) {
    if (!accessToken || !/^\d+$/.test(expectedUserId)) throw new Error('X user access token and expected account ID are required.');
  }
  async verifyAccount() {
    const response = await this.request('https://api.x.com/2/users/me', {
      headers: { Authorization: `Bearer ${this.accessToken}` }, signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`X account verification failed (${response.status}).`);
    const payload = await response.json() as { data?: { id?: string } };
    if (payload.data?.id !== this.expectedUserId) throw new Error('Connected X account does not match the expected account.');
  }
  async publish(jobId: string, text: string): Promise<PublishedPost> {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(jobId)) throw new Error('A stable launch job ID is required.');
    const post = validatePost(text);
    // Bind idempotency to both account and content.
    const digest = createHash('sha256').update(`${this.expectedUserId}\n${post.text}`).digest('hex');
    const previous = this.journal.get(jobId);
    if (previous) {
      if (previous.digest !== digest) throw new Error('Job ID already belongs to another account or post.');
      if (previous.status === 'published' && previous.post_id) return { id: previous.post_id, url: `https://x.com/i/status/${previous.post_id}` };
      throw new Error('Post outcome is unknown. Reconcile with X before retrying this launch.');
    }
    await this.verifyAccount();
    this.journal.reserve(jobId, digest);
    try {
      const response = await this.request('https://api.x.com/2/tweets', {
        method: 'POST', headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: post.text }), signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error();
      const payload = await response.json() as { data?: { id?: string } };
      const id = payload.data?.id;
      if (!id || !/^\d+$/.test(id)) throw new Error();
      this.journal.complete(jobId, id);
      return { id, url: `https://x.com/i/status/${id}` };
    } catch {
      throw new Error('X post did not return a confirmed result. Launch must stop; no automatic retry.');
    }
  }
}
