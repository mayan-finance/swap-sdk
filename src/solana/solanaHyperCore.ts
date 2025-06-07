import {
	Connection,
	PublicKey,
	Keypair,
	TransactionInstruction,
	ComputeBudgetProgram,
	AddressLookupTableAccount,
} from '@solana/web3.js';
import { Quote, ChainName, SwapMessageV0Params } from '../types';
import { getAssociatedTokenAddress, hexToUint8Array, getSafeU64Blob,
} from '../utils';
import { Buffer } from 'buffer';
import addresses from '../addresses';
import { getSwapSolana } from '../api';
import {
	createAssociatedTokenAccountInstruction,
	createInitializeRandomTokenAccountInstructions, createPayloadWriterCloseInstruction,
	createPayloadWriterCreateInstruction,
	createSplTransferInstruction,
	createTransferAllAndCloseInstruction,
	decentralizeClientSwapInstructions,
	getAddressLookupTableAccounts,
	validateJupSwap
} from './utils';
import { createMctpBridgeLedgerInstruction, createMctpBridgeWithFeeInstruction } from './solanaMctp';

export async function createHyperCoreDepositFromSolanaInstructions(
	quote: Quote,
	swapperAddress: string,
	destinationAddress: string,
	referrerAddress: string | null | undefined,
	connection: Connection,
	options: {
		allowSwapperOffCurve?: boolean;
		separateSwapTx?: boolean;
		usdcPermitSignature?: string;
	} = {}
): Promise<{
	instructions: TransactionInstruction[];
	signers: Keypair[];
	lookupTables: AddressLookupTableAccount[];
	swapMessageV0Params: SwapMessageV0Params | null;
}> {
	if (
		quote.toToken.contract !== addresses.ARBITRUM_USDC_CONTRACT ||
		quote.type !== 'MCTP'
	) {
		throw new Error('Unsupported quote type for USDC deposit: ' + quote.type);
	}
	if (!options?.usdcPermitSignature) {
		throw new Error('USDC permit signature is required for this quote');
	}

	const allowSwapperOffCurve = options.allowSwapperOffCurve || false;

	let instructions: TransactionInstruction[] = [];
	let signers: Keypair[] = [];
	let lookupTables: AddressLookupTableAccount[] = [];

	let _lookupTablesAddress: string[] = [];

	_lookupTablesAddress.push(addresses.LOOKUP_TABLE);

	// using for the swap via Jito Bundle
	let _swapAddressLookupTables: string[] = [];
	let swapInstructions: TransactionInstruction[] = [];
	let createSwapTpmTokenAccountInstructions: TransactionInstruction[] = [];
	const tmpSwapTokenAccount: Keypair = Keypair.generate();
	let swapMessageV0Params: SwapMessageV0Params | null = null;

	const trader = new PublicKey(swapperAddress);

	if (!quote.hyperCoreParams) {
		throw new Error('HyperCore parameters are required for this quote');
	}

	const inputMint = new PublicKey(quote.hyperCoreParams.initiateTokenContract);

	const payloadNonce = Math.floor(Math.random() * 65000); // Random nonce for the payload
	const [payloadAccount] = PublicKey.findProgramAddressSync(
		[
			Buffer.from('PAYLOAD'),
			trader.toBuffer(),
			(() => {
				const buf = Buffer.alloc(2);
				buf.writeUInt16LE(payloadNonce, 0);
				return buf;
			})(),
		],
		new PublicKey(addresses.MAYAN_PROGRAM_ID)
	);
	const payload = Buffer.alloc(101);
	const destAddressBuf = Buffer.from(hexToUint8Array(destinationAddress));
	if (destAddressBuf.length !== 20) {
		throw new Error('Invalid destination address length, expected 20 bytes');
	}
	const permitSignatureBuf = Buffer.from(
		hexToUint8Array(options.usdcPermitSignature)
	);
	if (permitSignatureBuf.length !== 65) {
		throw new Error('Invalid USDC permit signature length, expected 65 bytes');
	}
	payload.set(destAddressBuf, 0);
	payload.set(
		getSafeU64Blob(BigInt(quote.hyperCoreParams.depositAmountUSDC64)),
		20
	);
	payload.set(getSafeU64Blob(BigInt(quote.deadline64)), 28);
	payload.set(permitSignatureBuf, 36);

	const mctpRandomKey = Keypair.generate();

	const mctpProgram = new PublicKey(addresses.MCTP_PROGRAM_ID);

	const [ledger] = PublicKey.findProgramAddressSync(
		[
			Buffer.from('LEDGER_BRIDGE'),
			trader.toBytes(),
			mctpRandomKey.publicKey.toBytes(),
		],
		mctpProgram
	);
	const ledgerAccount = getAssociatedTokenAddress(
		inputMint, ledger, true
	);

	if (
		quote.fromToken.contract === quote.hyperCoreParams.initiateTokenContract
	) {
		if (quote.suggestedPriorityFee > 0) {
			instructions.push(
				ComputeBudgetProgram.setComputeUnitPrice({
					microLamports: quote.suggestedPriorityFee,
				})
			);
		}
		instructions.push(
			createAssociatedTokenAccountInstruction(trader, ledgerAccount, ledger, inputMint)
		);
		instructions.push(
			createSplTransferInstruction(
				getAssociatedTokenAddress(
					inputMint, trader, allowSwapperOffCurve
				),
				ledgerAccount,
				trader,
				BigInt(quote.hyperCoreParams.initiateAmountUSDC64),
			)
		);
		instructions.push(
			createPayloadWriterCreateInstruction(
				trader,
				payloadAccount,
				payload,
				payloadNonce
			)
		);
		instructions.push(
			createMctpBridgeLedgerInstruction({
				ledger,
				randomKey: mctpRandomKey.publicKey,
				swapperAddress: trader.toString(),
				mintAddress: inputMint.toString(),
				mode: 'WITH_FEE',
				feeSolana: BigInt(0),
				amountInMin64: BigInt(quote.hyperCoreParams.initiateAmountUSDC64),
				customPayload: payloadAccount,
				destinationAddress,
				referrerAddress,
				feeRedeem: quote.redeemRelayerFee,
				gasDrop: quote.gasDrop,
				toChain: 'arbitrum',
			})
		);
		const {
			instruction: _instruction,
			signers: _signers
		} = createMctpBridgeWithFeeInstruction(
			ledger,
			'arbitrum',
			quote.hyperCoreParams.initiateTokenContract,
			trader.toString(),
			BigInt(0),
		);
		instructions.push(_instruction);
		signers.push(..._signers);
		instructions.push(createPayloadWriterCloseInstruction(
			trader,
			payloadAccount,
			payloadNonce,
		));
	} else {
		const clientSwapRaw = await getSwapSolana({
			minMiddleAmount: quote.minMiddleAmount,
			middleToken: quote.hyperCoreParams.initiateTokenContract,
			userWallet: trader.toString(),
			slippageBps: quote.slippageBps,
			fromToken: quote.fromToken.contract,
			amountIn64: quote.effectiveAmountIn64,
			depositMode: 'HC_USDC',
			fillMaxAccounts: options?.separateSwapTx || false,
			tpmTokenAccount: tmpSwapTokenAccount.publicKey.toString()
		});
		const clientSwap = decentralizeClientSwapInstructions(clientSwapRaw, connection);

		if (options?.separateSwapTx && clientSwapRaw.maxAccountsFilled) {
			validateJupSwap(clientSwap, tmpSwapTokenAccount.publicKey, trader);
			createSwapTpmTokenAccountInstructions = await createInitializeRandomTokenAccountInstructions(
				connection,
				trader,
				inputMint,
				trader,
				tmpSwapTokenAccount,
			);
			swapInstructions.push(...clientSwap.computeBudgetInstructions);
			if (clientSwap.setupInstructions) {
				swapInstructions.push(...clientSwap.setupInstructions);
			}
			swapInstructions.push(clientSwap.swapInstruction);
			if (clientSwap.cleanupInstruction) {
				swapInstructions.push(clientSwap.cleanupInstruction);
			}
			_swapAddressLookupTables.push(...clientSwap.addressLookupTableAddresses);
		} else {
			validateJupSwap(clientSwap, ledgerAccount, trader);
			instructions.push(...clientSwap.computeBudgetInstructions);
			if (clientSwap.setupInstructions) {
				instructions.push(...clientSwap.setupInstructions);
			}
			instructions.push(clientSwap.swapInstruction);
			if (clientSwap.cleanupInstruction) {
				instructions.push(clientSwap.cleanupInstruction);
			}
			_lookupTablesAddress.push(...clientSwap.addressLookupTableAddresses);
		}
		instructions.push(createAssociatedTokenAccountInstruction(
			trader, ledgerAccount, ledger, new PublicKey(quote.mctpInputContract)
		));
		instructions.push(
			createSplTransferInstruction(
				tmpSwapTokenAccount.publicKey,
				ledgerAccount,
				trader,
				BigInt(quote.hyperCoreParams.initiateAmountUSDC64),
			)
		);
		instructions.push(createTransferAllAndCloseInstruction(
			trader,
			inputMint,
			tmpSwapTokenAccount.publicKey,
			getAssociatedTokenAddress(
				inputMint, trader, allowSwapperOffCurve
			),
			trader,
		));

		instructions.push(
			createPayloadWriterCreateInstruction(
				trader,
				payloadAccount,
				payload,
				payloadNonce
			)
		);

		const feeSolana: bigint = swapInstructions.length > 0 ? BigInt(0) : BigInt(quote.solanaRelayerFee64);

		instructions.push(createMctpBridgeLedgerInstruction({
			ledger,
			swapperAddress: trader.toString(),
			mintAddress: inputMint.toString(),
			randomKey: mctpRandomKey.publicKey,
			mode: 'WITH_FEE',
			feeSolana,
			amountInMin64: BigInt(quote.hyperCoreParams.initiateAmountUSDC64) + feeSolana,
			customPayload: payloadAccount,
			destinationAddress,
			referrerAddress,
			feeRedeem: quote.redeemRelayerFee,
			gasDrop: quote.gasDrop,
			toChain: 'arbitrum',
		}));
		instructions.push(createPayloadWriterCloseInstruction(
			trader,
			payloadAccount,
			payloadNonce,
		));
		if (swapInstructions.length > 0) {
			const {
				instruction: _instruction,
				signers: _signers
			} = createMctpBridgeWithFeeInstruction(
				ledger,
				'arbitrum',
				quote.hyperCoreParams.initiateTokenContract,
				trader.toString(),
				BigInt(0),
			);
			instructions.push(_instruction);
			signers.push(..._signers);
		}
	}

	const totalLookupTables = await getAddressLookupTableAccounts(
		_lookupTablesAddress.concat(_swapAddressLookupTables), connection
	);
	lookupTables = totalLookupTables.slice(0, _lookupTablesAddress.length);
	if (swapInstructions.length > 0) {
		const swapLookupTables = totalLookupTables.slice(_lookupTablesAddress.length);
		swapMessageV0Params = {
			messageV0: {
				payerKey: trader,
				instructions: swapInstructions,
				addressLookupTableAccounts: swapLookupTables,
			},
			createTmpTokenAccountIxs: createSwapTpmTokenAccountInstructions,
			tmpTokenAccount: tmpSwapTokenAccount,
		};
	}

	return { instructions, signers, lookupTables, swapMessageV0Params };
}
