import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validatePost, PostJournal, XPublisher } from '../src/x-post.js';

function fixture(request: typeof fetch) {
  const dir = mkdtempSync(join(tmpdir(), 'x-post-test-'));
  const file = join(dir, 'posts.sqlite');
  const journal = new PostJournal(file);
  return { file, journal, publisher: new XPublisher('test-token', '123', journal, request),
    close() { journal.close(); rmSync(dir, { recursive: true, force: true }); } };
}
const account = () => Response.json({ data: { id: '123' } });
test('X weighting supports Chinese, URLs and emoji without silent truncation', () => {
  assert.equal(validatePost('熊'.repeat(140)).weightedLength, 280);
  assert.throws(() => validatePost('熊'.repeat(141)));
  assert.equal(validatePost('https://example.com/long/path').weightedLength, 23);
  assert.equal(validatePost('👨‍👩‍👧‍👦').weightedLength, 2);
  assert.throws(() => validatePost('   '));
});
test('published post is reused after restart; changing the job content is rejected', async () => {
  let writes = 0;
  const f = fixture((async (_url, options) => options?.method === 'POST' ? (writes++, Response.json({ data: { id: '456' } })) : account()) as typeof fetch);
  try {
    assert.equal((await f.publisher.publish('job-1', '熊猫')).url, 'https://x.com/i/status/456');
    const reopened = new PostJournal(f.file);
    try {
      const p = new XPublisher('test-token', '123', reopened, (async () => { throw new Error('No network expected'); }) as typeof fetch);
      assert.equal((await p.publish('job-1', '熊猫')).id, '456');
      await assert.rejects(p.publish('job-1', '龙'), /another account or post/);
    } finally { reopened.close(); }
    assert.equal(writes, 1);
  } finally { f.close(); }
});
test('wrong account prevents a post; timeout persists uncertainty and prevents duplicate writes', async () => {
  let writes = 0;
  const f = fixture((async (_url, options) => {
    if (options?.method === 'POST') { writes++; throw new Error('timeout'); }
    return account();
  }) as typeof fetch);
  try {
    const wrong = new XPublisher('test-token', '999', f.journal, (async () => account()) as typeof fetch);
    await assert.rejects(wrong.publish('wrong', '熊猫'), /does not match/);
    assert.equal(f.journal.get('wrong'), undefined);
    await assert.rejects(f.publisher.publish('job-1', '熊猫'), /Launch must stop/);
    await assert.rejects(f.publisher.publish('job-1', '熊猫'), /Reconcile/);
    assert.equal(writes, 1);
  } finally { f.close(); }
});
