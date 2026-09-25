// SPDX-License-Identifier: MIT
import { ethers } from 'ethers';

export class MockProvider extends ethers.providers.JsonRpcProvider {
  private mockTokenContract: ethers.Contract;
  private mockAllowance: Map<string, { owner: string; spender: string; amount: string }>;
  
  constructor() {
    super('http://localhost:8545', 1);
    this.mockAllowance = new Map();
  }
  
  async mockTokenContract(tokenAddress: string): Promise<void> {
    this.mockTokenContract = new ethers.Contract(
      tokenAddress,
      [
        'function DOMAIN_SEPARATOR() view returns (bytes32)',
        'function nonces(address) view returns (uint256)',
        'function allowance(address, address) view returns (uint256)',
      ],
      this,
    );
    
    // Mock DOMAIN_SEPARATOR
    this.mockTokenContract.DOMAIN_SEPARATOR = async () => {
      return ethers.utils.hexlify(
        ethers.utils.defaultAbiCoder.encode(
          ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address', 'bytes32'],
          [
            ethers.utils.keccak256(ethers.utils.toUtf8Bytes('USDC Token')),
            ethers.utils.keccak256(
              ethers.utils.toUtf8Bytes(
                'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)',
              ),
            ),
            ethers.utils.keccak256(
              ethers.utils.toUtf8Bytes(
                'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)',
              ),
            ),
            1,
            tokenAddress,
            ethers.utils.keccak256(ethers.utils.toUtf8Bytes('salt')),
          ],
        ),
      );
    };
    
    // Mock nonces
    this.mockTokenContract.nonces = async (owner: string) => {
      return ethers.BigNumber.from(0);
    };
  }
  
  async mockAllowance(
    tokenAddress: string,
    owner: string,
    spender: string,
    amount: string,
  ): Promise<void> {
    this.mockAllowance.set(
      `${tokenAddress}-${owner}-${spender}`,
      { owner, spender, amount },
    );
  }
  
  override async getBlockNumber(): Promise<number> {
    return 12345678;
  }
  
  override async getBlock(blockNumber?: number): Promise<ethers.providers.Block> {
    return {
      number: 12345678,
      hash: '0xblockhash',
      parentHash: '0xparenthash',
      nonce: '0x1',
      sha3Uncles: '0xsha3uncles',
      logsBloom: '0x0'.repeat(512),
      transactions: [],
      transactionsRoot: '0xtransactionsroot',
      stateRoot: '0xstateroot',
      receiptsRoot: '0xreceiptsroot',
      miner: '0xminer',
      difficulty: ethers.BigNumber.from(0),
      totalDifficulty: ethers.BigNumber.from(0),
      extraData: '0xextadata',
      size: 0,
      gasLimit: ethers.BigNumber.from(30000000),
      gasUsed: ethers.BigNumber.from(0),
      timestamp: 1728456789, // Fixed timestamp for testing
      baseFeePerGas: ethers.BigNumber.from(0),
      withdrawals: [],
      mixHash: '0xmixhash',
      chainId: 8453,
    };
  }
  
  override async call(transaction: ethers.providers.TransactionRequest): Promise<string> {
    if (transaction.to === this.mockTokenContract.address) {
      const data = transaction.data;
      if (data.startsWith('0x70a08231')) { // allowance selector
        const [owner, spender] = ethers.utils.defaultAbiCoder.decode(
          ['address', 'address'],
          data.slice(10),
        );
        const key = `${transaction.to}-${owner}-${spender}`;
        const allowanceData = this.mockAllowance.get(key);
        if (allowanceData) {
          return ethers.utils.hexZeroPad(allowanceData.amount, 32);
        }
      } else if (data.startsWith('0x18160ddd')) { // nonces selector
        const [owner] = ethers.utils.defaultAbiCoder.decode(['address'], data.slice(10));
        return ethers.utils.hexZeroPad('0', 32);
      }
    }
    return '0x';
  }
}