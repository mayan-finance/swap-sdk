// SPDX-License-Identifier: MIT
import { ethers } from 'ethers';
import { Provider } from './types';

/**
 * Fetches the EIP-712 domain separator from the token contract.
 * Supports versions 1-10 of EIP-712 domain separation.
 */
export async function getPermitDomain(
  tokenAddress: string,
  provider: Provider,
): Promise<ethers.TypedDataDomain> {
  const tokenContract = new ethers.Contract(
    tokenAddress,
    ['function DOMAIN_SEPARATOR() view returns (bytes32)'],
    provider,
  );
  const domainSeparator = await tokenContract.DOMAIN_SEPARATOR();
  
  // Brute-force version detection (1-10)
  for (let version = 1; version <= 10; version++) {
    const domain = ethers.utils.defaultAbiCoder.decode(
      ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address', 'bytes32'],
      domainSeparator,
    );
    
    // EIP-712 domain structure: (name, version, chainId, verifyingContract, salt)
    if (domain[1] === ethers.utils.keccak256(ethers.utils.toUtf8Bytes(`EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)`)) &&
        domain[2] === ethers.utils.keccak256(ethers.utils.toUtf8Bytes(`EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)`)) &&
        domain[3] === version) {
      return {
        name: ethers.utils.toUtf8String(domain[0].slice(0, 32)),
        version: version.toString(),
        chainId: domain[4],
        verifyingContract: domain[5],
      };
    }
  }
  throw new Error('Unsupported EIP-712 domain version');
}

/**
 * Generates permit parameters for EIP-2612.
 */
export async function getPermitParams(
  tokenAddress: string,
  owner: string,
  spender: string,
  amount: string,
  provider: Provider,
  deadline?: number,
): Promise<ethers.TypedData> {
  const domain = await getPermitDomain(tokenAddress, provider);
  const blockNumber = await provider.getBlockNumber();
  const block = await provider.getBlock(blockNumber);
  const blockTimestamp = block.timestamp;
  
  // Use block timestamp if no deadline provided, else clamp to block time
  const permitDeadline = deadline ?? blockTimestamp + 3600; // Default: 1 hour
  
  return {
    types: {
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    domain,
    primaryType: 'Permit',
    message: {
      owner,
      spender,
      value: amount,
      nonce: await getNonce(tokenAddress, owner, provider),
      deadline: permitDeadline.toString(),
    },
  };
}

/**
 * Validates a permit signature against the token contract.
 * Throws if the permit is expired or invalid.
 */
export async function validatePermit(
  tokenAddress: string,
  permit: ethers.TypedDataSignature,
  provider: Provider,
): Promise<void> {
  const { v, r, s } = permit;
  const domain = await getPermitDomain(tokenAddress, provider);
  const blockNumber = await provider.getBlockNumber();
  const block = await provider.getBlock(blockNumber);
  const blockTimestamp = block.timestamp;
  
  const permitMessage = ethers.utils.defaultAbiCoder.encode(
    ['address', 'address', 'uint256', 'uint256', 'uint256'],
    [
      domain.verifyingContract,
      ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(
          `Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)`,
        ),
      ),
      ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(domain.name),
      ),
      ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(domain.version),
      ),
      domain.chainId,
    ],
  );
  
  const recoveredAddress = ethers.utils.verifyTypedData(
    domain,
    { Permit: permit.message.types.Permit },
    permit.message,
    permit,
  );
  
  if (recoveredAddress.toLowerCase() !== permit.message.owner.toLowerCase()) {
    throw new Error('EIP2612: invalid signature');
  }
  
  if (permit.message.deadline < blockTimestamp) {
    throw new Error('FiatTokenV2: permit is expired');
  }
}

/**
 * Checks if a token has sufficient allowance for a spender.
 */
export async function hasAllowance(
  tokenAddress: string,
  owner: string,
  spender: string,
  amount: string,
  provider: Provider,
): Promise<boolean> {
  const tokenContract = new ethers.Contract(
    tokenAddress,
    ['function allowance(address owner, address spender) view returns (uint256)'],
    provider,
  );
  const allowance = await tokenContract.allowance(owner, spender);
  return ethers.BigNumber.from(allowance).gte(ethers.BigNumber.from(amount));
}

/**
 * Gets the nonce for a permit.
 */
export async function getNonce(
  tokenAddress: string,
  owner: string,
  provider: Provider,
): Promise<number> {
  const tokenContract = new ethers.Contract(
    tokenAddress,
    ['function nonces(address owner) view returns (uint256)'],
    provider,
  );
  return (await tokenContract.nonces(owner)).toNumber();
}