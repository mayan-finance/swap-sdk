import {
	Connection,
	PublicKey,
	Keypair,
	TransactionInstruction,
	ComputeBudgetProgram,
	AddressLookupTableAccount,
} from '@solana/web3.js';
import { Quote, ChainName, SwapMessageV0Params, SolanaBridgeOptions } from '../types';
import {
	getAssociatedTokenAddress,
	getHyperCoreUSDCDepositCustomPayload,
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
	getLookupTableAddress,
	sandwichInstructionInCpiProxy,
	validateJupSwap
} from './utils';
import { createMctpBridgeLedgerInstruction, createMctpBridgeWithFeeInstruction } from './solanaMctp';

export async function createHyperCoreDepositFromSolanaInstructions(
	quote: Quote,
	swapperAddress: string,
	destinationAddress: string,
	referrerAddress: string | null | undefined,
	connection: Connection,
	options: SolanaBridgeOptions = {}
): Promise<{
	instructions: TransactionInstruction[];
	signers: Keypair[];
	lookupTables: AddressLookupTableAccount[];
	swapMessageV0Params: SwapMessageV0Params | null;
}> {
	if (
		quote.toToken.contract.toLowerCase() !== addresses.ARBITRUM_USDC_CONTRACT.toLowerCase() ||
		quote.type !== 'MCTP'
	) {
		throw new Error('Unsupported quote type for USDC deposit: ' + quote.type);
	}
	if (!options?.usdcPermitSignature) {
		throw new Error('USDC permit signature is required for this quote');
	}
	if (!quote.hyperCoreParams) {
		throw new Error('HyperCore parameters are required for this quote');
	}
	if (!Number(quote.deadline64)) {
		throw new Error('HyperCore deposit requires timeout');
	}

	const allowSwapperOffCurve = options.allowSwapperOffCurve || false;

	let instructions: TransactionInstruction[] = [];
	let signers: Keypair[] = [];
	let lookupTables: AddressLookupTableAccount[] = [];

	let _lookupTablesAddress: string[] = [];

	_lookupTablesAddress.push(getLookupTableAddress(quote.fromChain));

	// using for the swap via Jito Bundle
	let _swapAddressLookupTables: string[] = [];
	let swapInstructions: TransactionInstruction[] = [];
	let createSwapTpmTokenAccountInstructions: TransactionInstruction[] = [];
	const tmpSwapTokenAccount: Keypair = Keypair.generate();
	let swapMessageV0Params: SwapMessageV0Params | null = null;

	const trader = new PublicKey(swapperAddress);
	const relayerAddress = quote.relayer || swapperAddress;

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
		new PublicKey(addresses.PAYLOAD_WRITER_PROGRAM_ID)
	);
	const payload = getHyperCoreUSDCDepositCustomPayload(quote, destinationAddress, options.usdcPermitSignature);

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
			sandwichInstructionInCpiProxy(createAssociatedTokenAccountInstruction(trader, ledgerAccount, ledger, inputMint))
		);
		instructions.push(
			sandwichInstructionInCpiProxy(createSplTransferInstruction(
				getAssociatedTokenAddress(
					inputMint, trader, allowSwapperOffCurve
				),
				ledgerAccount,
				trader,
				BigInt(quote.hyperCoreParams.bridgeAmountUSDC64),
			))
		);
		instructions.push(
			sandwichInstructionInCpiProxy(createPayloadWriterCreateInstruction(
				trader,
				payloadAccount,
				payload,
				payloadNonce
			))
		);
		instructions.push(
			sandwichInstructionInCpiProxy(createMctpBridgeLedgerInstruction({
				ledger,
				randomKey: mctpRandomKey.publicKey,
				swapperAddress: trader.toString(),
				mintAddress: inputMint.toString(),
				mode: 'WITH_FEE',
				feeSolana: BigInt(0),
				amountInMin64: BigInt(quote.hyperCoreParams.bridgeAmountUSDC64),
				customPayload: payloadAccount,
				destinationAddress: addresses.HC_ARBITRUM_DEPOSIT_PROCESSOR,
				referrerAddress,
				feeRedeem: 0,
				gasDrop: quote.hyperCoreParams.failureGasDrop,
				toChain: 'arbitrum',
				relayerAddress,
			}), options.skipProxyMayanInstructions)
		);
		const {
			instruction: _instruction,
			signers: _signers
		} = createMctpBridgeWithFeeInstruction(
			ledger,
			'arbitrum',
			quote.hyperCoreParams.initiateTokenContract,
			relayerAddress,
			BigInt(0),
			quote.fromChain,
		);
		instructions.push(sandwichInstructionInCpiProxy(_instruction, options.skipProxyMayanInstructions));
		signers.push(..._signers);
		instructions.push(sandwichInstructionInCpiProxy(createPayloadWriterCloseInstruction(
			trader,
			payloadAccount,
			payloadNonce,
		)));
	} else {
		if (!quote.minMiddleAmount) {
			throw new Error('minMiddleAmount is required for swap');
		}
		const clientSwapRaw = await getSwapSolana({
			minMiddleAmount: quote.minMiddleAmount,
			middleToken: quote.hyperCoreParams.initiateTokenContract,
			userWallet: trader.toString(),
			slippageBps: quote.slippageBps,
			fromToken: quote.fromToken.contract,
			amountIn64: quote.effectiveAmountIn64,
			depositMode: 'HC_USDC',
			fillMaxAccounts: options?.separateSwapTx || false,
			tpmTokenAccount: tmpSwapTokenAccount.publicKey.toString(),
			referrerAddress: referrerAddress || undefined,
			chainName: quote.fromChain,
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
			validateJupSwap(clientSwap, tmpSwapTokenAccount.publicKey, trader);
			instructions.push(...clientSwap.computeBudgetInstructions);
			const _createSwapTpmTokenAccountInstructions = await createInitializeRandomTokenAccountInstructions(
				connection,
				trader,
				inputMint,
				trader,
				tmpSwapTokenAccount,
			);
			instructions.push(...(_createSwapTpmTokenAccountInstructions).map(ins => sandwichInstructionInCpiProxy(ins)));
			signers.push(tmpSwapTokenAccount);
			if (clientSwap.setupInstructions) {
				instructions.push(...(clientSwap.setupInstructions.map(ins => sandwichInstructionInCpiProxy(ins))));
			}
			instructions.push(sandwichInstructionInCpiProxy(clientSwap.swapInstruction));
			if (clientSwap.cleanupInstruction) {
				instructions.push(sandwichInstructionInCpiProxy(clientSwap.cleanupInstruction));
			}
			_lookupTablesAddress.push(...clientSwap.addressLookupTableAddresses);
		}

		const feeSolana: bigint = swapInstructions.length > 0 ? BigInt(0) : BigInt(quote.solanaRelayerFee64);
		let initiateAmountUSDC64 = BigInt(quote.hyperCoreParams.bridgeAmountUSDC64);
		if (swapInstructions.length > 0) {
			initiateAmountUSDC64 = initiateAmountUSDC64 - BigInt(quote.solanaRelayerFee64);
		}

		instructions.push(sandwichInstructionInCpiProxy(createAssociatedTokenAccountInstruction(
			trader, ledgerAccount, ledger, new PublicKey(quote.mctpInputContract)
		)));

		instructions.push(
			sandwichInstructionInCpiProxy(createSplTransferInstruction(
				tmpSwapTokenAccount.publicKey,
				ledgerAccount,
				trader,
				initiateAmountUSDC64,
			))
		);

		const traderInputMintAccount = getAssociatedTokenAddress(
			inputMint, trader, allowSwapperOffCurve
		);
		const traderInputMintAccountInfo = await connection.getAccountInfo(traderInputMintAccount);
		if (!traderInputMintAccountInfo || !traderInputMintAccountInfo.data) {
			instructions.push(sandwichInstructionInCpiProxy(createAssociatedTokenAccountInstruction(
				trader,
				traderInputMintAccount,
				trader,
				inputMint
			)));
		}
		instructions.push(sandwichInstructionInCpiProxy(createTransferAllAndCloseInstruction(
			trader,
			inputMint,
			tmpSwapTokenAccount.publicKey,
			traderInputMintAccount,
			trader,
		)));

		instructions.push(
			sandwichInstructionInCpiProxy(createPayloadWriterCreateInstruction(
				trader,
				payloadAccount,
				payload,
				payloadNonce
			))
		);

		instructions.push(sandwichInstructionInCpiProxy(createMctpBridgeLedgerInstruction({
			ledger,
			swapperAddress: trader.toString(),
			mintAddress: inputMint.toString(),
			randomKey: mctpRandomKey.publicKey,
			mode: 'WITH_FEE',
			feeSolana,
			amountInMin64: initiateAmountUSDC64,
			customPayload: payloadAccount,
			destinationAddress: addresses.HC_ARBITRUM_DEPOSIT_PROCESSOR,
			referrerAddress,
			feeRedeem: 0,
			gasDrop: quote.hyperCoreParams.failureGasDrop,
			toChain: 'arbitrum',
			relayerAddress,
		}), options.skipProxyMayanInstructions));
		instructions.push(sandwichInstructionInCpiProxy(createPayloadWriterCloseInstruction(
			trader,
			payloadAccount,
			payloadNonce,
		)));
		if (swapInstructions.length > 0) {
			const {
				instruction: _instruction,
				signers: _signers
			} = createMctpBridgeWithFeeInstruction(
				ledger,
				'arbitrum',
				quote.hyperCoreParams.initiateTokenContract,
				relayerAddress,
				BigInt(0),
				quote.fromChain,
			);
			instructions.push(sandwichInstructionInCpiProxy(_instruction, options.skipProxyMayanInstructions));
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
