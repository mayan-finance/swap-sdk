import { swapFromSolana, type Quote } from '@mayanfinance/swap-sdk';
import {
	Connection,
	Keypair,
	Transaction,
	VersionedTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';

const privateKey = process.env.SOLANA_WALLET_PRIVATE_KEY!;
const walletDstAddr = process.env.WALLET_DST_ADDRESS!;
if (!privateKey || !walletDstAddr) {
	throw new Error(
		'Please set SOLANA_WALLET_PRIVATE_KEY and WALLET_DST_ADDRESS'
	);
}

const privateKeyArray = bs58.decode(privateKey);
const wallet = Keypair.fromSecretKey(privateKeyArray);

const connection = new Connection('https://solana-rpc.publicnode.com');

async function signer(trx: Transaction): Promise<Transaction>;
async function signer(trx: VersionedTransaction): Promise<VersionedTransaction>;
async function signer(
	trx: Transaction | VersionedTransaction
): Promise<Transaction | VersionedTransaction> {
	if ('version' in trx) {
		(trx as VersionedTransaction).sign([wallet]);
	} else {
		(trx as Transaction).partialSign(wallet);
	}
	return trx;
}

export async function swapSolana(quote: Quote): Promise<string> {
	const jitoConfig = await getJitoConfig();
	const jitoTipLamports = await getJitoTipLamports();
	const jitoTip = jitoConfig?.enable
		? Math.min(
				jitoTipLamports || jitoConfig?.defaultTipLamports,
				jitoConfig?.maxTipLamports
		  )
		: 0;

	let jitoOptions = {
		tipLamports: jitoTip,
		jitoAccount: jitoConfig.jitoAccount,
		jitoSendUrl: jitoConfig.sendBundleUrl,
		signAllTransactions: async <T extends Transaction | VersionedTransaction>(
			trxs: T[]
		): Promise<T[]> => {
			for (let i = 0; i < trxs.length; i++) {
				if ('version' in trxs[i]) {
					(trxs[i] as VersionedTransaction).sign([wallet]);
				} else {
					(trxs[i] as Transaction).partialSign(wallet);
				}
			}
			return trxs;
		},
	};

	const swapRes = await swapFromSolana(
		quote,
		wallet.publicKey.toString(),
		walletDstAddr,
		null,
		signer,
		connection,
		[],
		{ skipPreflight: true },
		jitoOptions
	);
	if (!swapRes.signature) {
		throw new Error('error: try again');
	}

	try {
		const { blockhash, lastValidBlockHeight } =
			await connection.getLatestBlockhash();
		const result = await connection.confirmTransaction(
			{
				signature: swapRes.signature,
				blockhash: blockhash,
				lastValidBlockHeight: lastValidBlockHeight,
			},
			'confirmed'
		);
		if (result?.value.err) {
			throw new Error(`Transaction ${swapRes.serializedTrx} reverted!`);
		}
		return swapRes.signature;
	} catch (error) {
		const res = await fetch(
			`https://explorer-api.mayan.finance/v3/swap/trx/${swapRes.signature}`
		);
		if (res.status !== 200) {
			throw error;
		}
		return swapRes.signature;
	}
}

type SolanaJitoConfig = {
	enable: boolean;
	defaultTipLamports: number;
	maxTipLamports: number;
	sendBundleUrl: string;
	jitoAccount: string;
};

type SiaResponse = Readonly<{
	solanaJitoConfig: SolanaJitoConfig;
}>;

async function getJitoConfig(): Promise<SolanaJitoConfig> {
	const res = await fetch(`https://sia.mayan.finance/v4/init`);
	const data: SiaResponse = await res.json();
	return data.solanaJitoConfig;
}

async function getJitoTipLamports() {
	const res = await fetch(`https://price-api.mayan.finance/jito-tips/suggest`);
	const data = await res.json();
	const tip =
		typeof data?.default === 'number' && Number.isFinite(data.default)
			? data?.default?.toFixed(9)
			: null;
	return tip ? Math.floor(Number(tip) * 10 ** 9) : null;
}
