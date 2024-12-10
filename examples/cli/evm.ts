import { swapFromEvm, type Quote } from '@mayanfinance/swap-sdk';
import { ethers } from 'ethers';

const privateKey = process.env.EVM_WALLET_PRIVATE_KEY!;
const walletDstAddr = process.env.WALLET_DST_ADDRESS!;
if (!privateKey || !walletDstAddr) {
	throw new Error('Please set EVM_WALLET_PRIVATE_KEY and WALLET_DST_ADDRESS');
}

const wallet = new ethers.Wallet(privateKey);
const provider = ethers.getDefaultProvider('matic');

export async function swapEVM(quote: Quote): Promise<string> {
	const signer = wallet.connect(provider);
	const walletSrcAddr = await wallet.getAddress();

	const swapRes = await swapFromEvm(
		quote,
		walletSrcAddr,
		walletDstAddr,
		null,
		signer,
		null,
		null,
		null
	);
	if (typeof swapRes === 'string') {
		throw swapRes;
	}
	return (swapRes as ethers.TransactionResponse).hash;
}
