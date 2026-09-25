// SPDX-License-Identifier: MIT
import { ethers } from 'ethers';
import { expect } from 'chai';
import { getPermitParams, validatePermit, hasAllowance } from '../src/permit';
import { MockProvider } from './utils/mockProvider';

describe('Permit Validation', () => {
  let provider: MockProvider;
  const tokenAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  const owner = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
  const spender = '0xSwiftMayanContract';
  const amount = '100000000';
  
  before(async () => {
    provider = new MockProvider();
    await provider.mockTokenContract(tokenAddress);
  });
  
  it('should generate valid permit parameters', async () => {
    const params = await getPermitParams(
      tokenAddress,
      owner,
      spender,
      amount,
      provider,
    );
    
    expect(params.domain.name).to.equal('USDC Token');
    expect(params.domain.version).to.equal('1');
    expect(params.message.deadline).to.be.a('string');
  });
  
  it('should validate a valid permit', async () => {
    const params = await getPermitParams(
      tokenAddress,
      owner,
      spender,
      amount,
      provider,
    );
    
    const signer = new ethers.Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
    const permit = await signer._signTypedData(
      params.domain,
      params.types,
      params.message,
    );
    
    await validatePermit(tokenAddress, permit, provider);
  });
  
  it('should reject expired permits', async () => {
    const params = await getPermitParams(
      tokenAddress,
      owner,
      spender,
      amount,
      provider,
      0, // Expired deadline
    );
    
    const signer = new ethers.Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
    const permit = await signer._signTypedData(
      params.domain,
      params.types,
      params.message,
    );
    
    await expect(
      validatePermit(tokenAddress, permit, provider),
    ).to.be.rejectedWith('FiatTokenV2: permit is expired');
  });
  
  it('should reject invalid signatures', async () => {
    const params = await getPermitParams(
      tokenAddress,
      owner,
      spender,
      amount,
      provider,
    );
    
    // Tamper with the signature
    const invalidPermit = {
      ...params,
      signature: {
        v: params.signature.v,
        r: '0x' + 'ff'.repeat(32),
        s: '0x' + 'ff'.repeat(32),
      },
    };
    
    await expect(
      validatePermit(tokenAddress, invalidPermit, provider),
    ).to.be.rejectedWith('EIP2612: invalid signature');
  });
  
  it('should detect sufficient allowance', async () => {
    await provider.mockAllowance(tokenAddress, owner, spender, amount);
    const hasAllowanceResult = await hasAllowance(
      tokenAddress,
      owner,
      spender,
      amount,
      provider,
    );
    expect(hasAllowanceResult).to.be.true;
  });
  
  it('should detect insufficient allowance', async () => {
    await provider.mockAllowance(tokenAddress, owner, spender, '1');
    const hasAllowanceResult = await hasAllowance(
      tokenAddress,
      owner,
      spender,
      amount,
      provider,
    );
    expect(hasAllowanceResult).to.be.false;
  });
});