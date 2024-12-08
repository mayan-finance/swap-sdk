import { fetchQuote, swapFromEvm } from '@mayanfinance/swap-sdk';
import { ethers } from 'ethers';

const privateKey = process.env.EVM_WALLET_PRIVATE_KEY!;

const wallet = new ethers.Wallet(privateKey);
const provider = ethers.getDefaultProvider('matic');

export async function swapEVM(): Promise<string> {
	const signer = wallet.connect(provider);
	const walletAddr = await wallet.getAddress();

	const quotes = await fetchQuote({
		amount: 2,
		fromChain: 'polygon',
		fromToken: '0x0000000000000000000000000000000000000000',
		toChain: 'base',
		toToken: '0x0000000000000000000000000000000000000000',
		slippageBps: 'auto',
	});

	const swapRes = await swapFromEvm(
		quotes[0],
		walletAddr,
		walletAddr,
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
