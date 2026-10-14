/** Preparation adapter only. Never signs, unlocks keys or broadcasts. */
import 'dotenv/config';
import { createPublicClient, http, zeroAddress } from 'viem';
import { bsc } from 'viem/chains';
import { readFileSync } from 'node:fs';
import { PORTAL } from './abi.js';
import { buildLaunch, mineTaxSalt, validateLaunch, TAX_V3_IMPL, type LaunchInput } from './flap-launch.js';
import { validatePost } from './x-post.js';
async function main() {
  const mode = process.argv[2];
  if (mode === 'post-preview') {
    const payload = JSON.parse(readFileSync(0, 'utf8')) as { text: string };
    return validatePost(payload.text);
  }
  if (mode === 'status') {
    const url = (process.env.RPC_URLS ?? '').split(',').map(s => s.trim()).find(s => s.startsWith('https://'));
    if (!url) return { connected: false, chainId: 56, portal: PORTAL, error: 'BSC RPC is not configured.' };
    try {
      const client = createPublicClient({ chain: bsc, transport: http(url, { timeout: 6000, retryCount: 0 }) });
      const [chainId, block, code, implementation] = await Promise.all([client.getChainId(),client.getBlockNumber(),client.getCode({address:PORTAL}),client.getCode({address:TAX_V3_IMPL})]);
      return { connected: chainId === 56 && !!code && code !== '0x' && !!implementation && implementation !== '0x',
        chainId, block: block.toString(), portal: PORTAL, taxImplementation: TAX_V3_IMPL,
        liveDeploymentEnabled: false, detail: 'Read-only RPC/code check. Tax routing, fees and CREATE2 prediction still require transaction simulation.' };
    } catch { return { connected: false, chainId: 56, portal: PORTAL, error: 'BSC RPC check failed. No signing or broadcast occurred.' }; }
  }
  if (mode !== 'prepare') throw new Error('Only status, post-preview and prepare modes are supported. Live deployment is disabled.');
  const input = JSON.parse(readFileSync(0,'utf8')) as LaunchInput;
  validateLaunch(input);
  const mined = mineTaxSalt();
  return { ...buildLaunch(input, mined.salt), iterations: mined.iterations,
    mode: 'unsigned-preparation', nextStep: 'Verify metadata and simulate the transaction before any live signing.' };
}
main().then(result => console.log(JSON.stringify(result))).catch(error => {
  const message = error instanceof Error ? error.message : 'Preparation failed.';
  console.log(JSON.stringify({ error: message.length < 180 && !/https?:|Request|HTTP/i.test(message) ? message : 'Preparation failed. Check local configuration.' }));
  process.exitCode = 1;
});
