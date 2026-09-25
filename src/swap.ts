// SPDX-License-Identifier: MIT
import { ethers } from 'ethers';
import { Provider, Quote, SwapOptions } from './types';
import { validatePermit, hasAllowance, getPermitParams } from './permit';

/**
 * Executes a swap from EVM to Solana.
 */
export async function swapFromEvm(
  quote: Quote,
  fromAddress: string,
  toAddress: string,
  options?: SwapOptions,
  provider?: Provider,
  permit?: ethers.TypedDataSignature,
  gasDrop?: string,
  gasDropSigner?: ethers.Signer,
): Promise<ethers.ContractTransactionResponse> {
  const { swiftMayanContract, fromToken, amountIn64, slippageBps } = quote;
  const { deadline = Math.floor(Date.now() / 1000) + 3600 } = options || {};
  
  // Check for existing allowance (skip permit if sufficient)
  const hasSufficientAllowance = await hasAllowance(
    fromToken,
    fromAddress,
    swiftMayanContract,
    amountIn64,
    provider,
  );
  
  if (!hasSufficientAllowance) {
    if (!permit) {
      // Generate permit if none provided
      const permitParams = await getPermitParams(
        fromToken,
        fromAddress,
        swiftMayanContract,
        amountIn64,
        provider,
        deadline,
      );
      
      // Sign permit (assumes provider is a signer)
      const signer = provider as ethers.Signer;
      permit = await signer._signTypedData(
        permitParams.domain,
        permitParams.types,
        permitParams.message,
      );
    } else {
      // Validate manually-provided permit
      await validatePermit(fromToken, permit, provider);
    }
  }
  
  // Build swap transaction
  const swapTx = await buildSwapTx(
    quote,
    fromAddress,
    toAddress,
    hasSufficientAllowance ? null : permit,
    gasDrop,
    gasDropSigner,
  );
  
  return await provider.sendTransaction(swapTx);
}

/**
 * Builds the raw swap transaction.
 */
function buildSwapTx(
  quote: Quote,
  fromAddress: string,
  toAddress: string,
  permit?: ethers.TypedDataSignature,
  gasDrop?: string,
  gasDropSigner?: ethers.Signer,
): ethers.PopulatedTransaction {
  const { swiftMayanContract, fromToken, amountIn64, slippageBps } = quote;
  
  const tx: ethers.PopulatedTransaction = {
    to: swiftMayanContract,
    data: ethers.utils.defaultAbiCoder.encode(
      ['address', 'address', 'uint64', 'uint256', 'uint256', 'bytes'],
      [
        fromToken,
        toAddress,
        slippageBps,
        ethers.BigNumber.from(amountIn64),
        Math.floor(Date.now() / 1000) + 3600, // Deadline
        permit ? ethers.utils.arrayify(permit) : '0x',
      ],
    ),
  };
  
  if (gasDrop && gasDropSigner) {
    tx.data += ethers.utils.arrayify(
      ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes('GasDrop(address)'),
      ).slice(0, 10) + // GasDrop selector
      ethers.utils.hexZeroPad(gasDrop, 32).slice(2),
    );
  }
  
  return tx;
}