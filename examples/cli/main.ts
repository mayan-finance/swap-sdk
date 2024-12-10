import { fetchQuote } from '@mayanfinance/swap-sdk';
import { swapSolana } from './solana';
import { swapEVM } from './evm';

// or for example 'polygon' to swap from evm chain (note to change the amount)
const fromChain = 'solana';
const fromToken = '0x0000000000000000000000000000000000000000';
const toChain = 'base';
const toToken = '0x0000000000000000000000000000000000000000';

(async () => {
	const quotes = await fetchQuote({
		amount: 0.01,
		fromChain,
		fromToken,
		toChain,
		toToken,
		slippageBps: 'auto',
	});

	let txHash;
	if (fromChain === 'solana') {
		txHash = await swapSolana(quotes[0]);
	} else {
		txHash = await swapEVM(quotes[0]);
	}

	console.log(
		`Go and see your swap here: https://explorer.mayan.finance/swap/${txHash}`
	);
})();
