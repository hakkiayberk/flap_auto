import { randomBytes } from 'node:crypto';
import { encodeFunctionData, getAddress, getContractAddress, keccak256, parseAbi, parseEther, toBytes, zeroAddress, zeroHash, type Address, type Hex } from 'viem';
import { PORTAL } from './abi.js';
// Official flap-sh/FlapVaultExample IPortal.NewTokenV6Params and flap-skills reference.
export const TAX_V3_IMPL = '0x024f18294970B5c76c0691b87f138A0317156422' as const;
export const launchAbi = parseAbi([
  'function newTokenV6((string name,string symbol,string meta,uint8 dexThresh,bytes32 salt,uint8 migratorType,address quoteToken,uint256 quoteAmt,address beneficiary,bytes permitData,bytes32 extensionID,bytes extensionData,uint8 dexId,uint8 lpFeeProfile,uint16 buyTaxRate,uint16 sellTaxRate,uint64 taxDuration,uint64 antiFarmerDuration,uint16 mktBps,uint16 deflationBps,uint16 dividendBps,uint16 lpBps,uint256 minimumShareBalance,address dividendToken,address commissionReceiver,uint8 tokenVersion) params) payable returns (address token)',
]);
export type LaunchInput = { name: string; symbol: string; metadataCid: string; buyTaxBps: number; sellTaxBps: number;
  distribution: 'recipient' | 'dividend'; beneficiary: string; taxDays: number; antiFarmerDays: number;
  minimumDividendTokens: string; initialBuyBnb: string };
function bounded(n: number, min: number, max: number, label: string) {
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Invalid ${label}.`);
}
export function validateLaunch(input: LaunchInput) {
  if (!input.name.trim() || input.name.length > 32 || !input.symbol.trim() || input.symbol.length > 8) throw new Error('Name and symbol are required (maximum 32 / 8 characters).');
  if (!/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|baf[a-z2-7]{20,100})$/.test(input.metadataCid)) throw new Error('A Flap-pinned metadata CID is required.');
  bounded(input.buyTaxBps, 0, 1000, 'buy tax'); bounded(input.sellTaxBps, 0, 1000, 'sell tax');
  if (!input.buyTaxBps && !input.sellTaxBps) throw new Error('At least one tax rate must be non-zero.');
  if (!['recipient','dividend'].includes(input.distribution)) throw new Error('Choose a tax distribution.');
  const beneficiary = getAddress(input.beneficiary);
  if (beneficiary === zeroAddress) throw new Error('A non-zero beneficiary is required.');
  bounded(input.taxDays, 365, 36500, 'tax duration');
  bounded(input.antiFarmerDays, 0, 365, 'anti-farmer duration');
  if (!/^\d+(\.\d{1,18})?$/.test(input.initialBuyBnb) || !/^\d+(\.\d{1,18})?$/.test(input.minimumDividendTokens)) throw new Error('Use a decimal amount.');
  const quoteAmt = parseEther(input.initialBuyBnb);
  if (quoteAmt > parseEther('0.1')) throw new Error('Launch buy exceeds the preparation limit of 0.1 BNB.');
  return { beneficiary, quoteAmt };
}
export function predictTaxToken(salt: Hex): Address {
  const bytecode = `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${TAX_V3_IMPL.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3` as Hex;
  return getContractAddress({ from: PORTAL, salt: toBytes(salt), bytecode, opcode: 'CREATE2' });
}
export function mineTaxSalt(maxIterations = 500000) {
  let salt = `0x${randomBytes(32).toString('hex')}` as Hex;
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const address = predictTaxToken(salt);
    if (address.toLowerCase().endsWith('7777')) return { salt, address, iterations: iteration };
    salt = keccak256(salt);
  }
  throw new Error('Salt search reached its preparation bound. Retry preparation.');
}
export function buildLaunch(input: LaunchInput, salt: Hex) {
  const { beneficiary, quoteAmt } = validateLaunch(input);
  if (!predictTaxToken(salt).toLowerCase().endsWith('7777')) throw new Error('Tax token salt must predict an address ending in 7777.');
  const params = { name: input.name, symbol: input.symbol, meta: input.metadataCid, dexThresh: 1,
    salt, migratorType: 1, quoteToken: zeroAddress, quoteAmt, beneficiary, permitData: '0x' as Hex,
    extensionID: zeroHash, extensionData: '0x' as Hex, dexId: 0, lpFeeProfile: 0,
    buyTaxRate: input.buyTaxBps, sellTaxRate: input.sellTaxBps,
    taxDuration: BigInt(input.taxDays * 86400), antiFarmerDuration: BigInt(input.antiFarmerDays * 86400),
    mktBps: input.distribution === 'recipient' ? 10000 : 0, deflationBps: 0,
    dividendBps: input.distribution === 'dividend' ? 10000 : 0, lpBps: 0,
    minimumShareBalance: input.distribution === 'dividend' ? parseEther(input.minimumDividendTokens) : 0n,
    dividendToken: zeroAddress, commissionReceiver: zeroAddress, tokenVersion: 6 };
  return { chainId: 56, to: PORTAL, value: quoteAmt.toString(), data: encodeFunctionData({ abi: launchAbi, functionName: 'newTokenV6', args: [params] }),
    predictedTokenAddress: predictTaxToken(salt), salt,
    predictionVerifiedOnChain: false, broadcast: false, signed: false };
}
