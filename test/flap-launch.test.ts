import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeFunctionData, parseEther, zeroAddress } from 'viem';
import { buildLaunch, validateLaunch, launchAbi, type LaunchInput } from '../src/flap-launch.js';
import { PORTAL } from '../src/abi.js';
// Public vanity salt for an unsigned test plan, not a wallet key.
const salt = '0x9379c5c905f95cc8e25f9e94a183af7cf783aa5c3e8dfefd2fceb6ae15442804';
const input: LaunchInput = { name:'黑柴', symbol:'黑柴', metadataCid:`Qm${'a'.repeat(44)}`, buyTaxBps:200, sellTaxBps:200,
  distribution:'recipient', beneficiary:'0x1111111111111111111111111111111111111111', taxDays:365, antiFarmerDays:0,
  minimumDividendTokens:'0', initialBuyBnb:'0.005' };
test('Flap unsigned plan encodes BNB, tax V3, recipient allocation and the selected buy amount',()=>{
  const plan=buildLaunch(input,salt);
  const decoded=decodeFunctionData({abi:launchAbi,data:plan.data});
  assert.equal(decoded.functionName,'newTokenV6');
  const p=decoded.args[0];
  assert.equal(plan.to,PORTAL); assert.equal(plan.chainId,56); assert.equal(plan.value,parseEther('0.005').toString());
  assert.equal(p.name,'黑柴'); assert.equal(p.quoteToken,zeroAddress); assert.equal(p.tokenVersion,6);
  assert.equal(p.buyTaxRate,200); assert.equal(p.sellTaxRate,200); assert.equal(p.mktBps,10000); assert.equal(p.dividendBps,0);
  assert.equal(plan.predictedTokenAddress,'0x017AC1991D81d503041c92a5DcDa4d86B87d7777');
  assert.equal(plan.predictionVerifiedOnChain,false); assert.equal(plan.signed,false); assert.equal(plan.broadcast,false);
});
test('Dividend plan uses native BNB rewards and token-unit minimum balances',()=>{
  const plan=buildLaunch({...input,distribution:'dividend',minimumDividendTokens:'100',initialBuyBnb:'0'},salt);
  const p=decodeFunctionData({abi:launchAbi,data:plan.data}).args[0];
  assert.equal(p.mktBps,0); assert.equal(p.dividendBps,10000); assert.equal(p.dividendToken,zeroAddress);
  assert.equal(p.minimumShareBalance,parseEther('100')); assert.equal(plan.value,'0');
});
test('Invalid taxes, duration, missing recipient, over-budget and non-vanity salts cannot produce a plan',()=>{
  for(const patch of [{buyTaxBps:0,sellTaxBps:0},{buyTaxBps:1001},{taxDays:1},{beneficiary:zeroAddress},
    {initialBuyBnb:'0.2'},{minimumDividendTokens:'1e2'},{distribution:'unknown'},{metadataCid:''}])
    assert.throws(()=>validateLaunch({...input,...patch} as LaunchInput));
  assert.throws(()=>buildLaunch(input,`0x${'0'.repeat(64)}`),/7777/);
});
