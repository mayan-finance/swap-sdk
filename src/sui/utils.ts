import type { SuiGrpcClient } from '@mysten/sui/grpc';
import { SuiFunctionNestedResult, SuiFunctionParameter } from '../types';
import { Transaction, TransactionResult } from '@mysten/sui/transactions';

// Minimal coin shape used by fetchAllCoins/resolveInputCoin (subset of the v1
// CoinStruct). v2 `listCoins` returns `objectId` and `balance` (as a string).
type SuiCoin = { coinObjectId: string; balance: string; coinType: string };

/**
 * assertArgumentIsImmutable
 *
 * Validates whether a specific argument of a given Move function in a Sui module is immutable.
 * This includes checking if the argument type is either `Pure` or an object passed by immutable reference.
 *
 * @param params - An object containing the following properties:
 *    - package: The Sui package containing the Move module.
 *    - module: The name of the Move module.
 *    - function: The name of the Move function to validate.
 *    - argumentIndex: The index of the argument to check for immutability.
 * @param suiClient - An instance of `SuiGrpcClient` used to interact with the Sui blockchain.
 *
 * @throws Will throw an error if:
 *    - The argument types cannot be retrieved from the Sui client.
 *    - The specified argument is not immutable (i.e., not `Pure` or passed as an immutable reference).
 *
 * @returns A Promise that resolves if the specified argument is immutable, or rejects with an error otherwise.
 */
export async function assertArgumentIsImmutable(
	params: {
		package: string;
		module: string;
		function: string;
		argumentIndex: number;
	},
	suiClient: SuiGrpcClient
): Promise<void> {
	let parameters: Awaited<
		ReturnType<SuiGrpcClient['getMoveFunction']>
	>['function']['parameters'];
	try {
		const { function: fn } = await suiClient.getMoveFunction({
			packageId: params.package,
			moduleName: params.module,
			name: params.function,
		});
		parameters = fn.parameters;
	} catch (error) {
		throw new Error(
			`Failed to fetch ${params.package}::${params.module}::${params.function} ArgTypes`
		);
	}
	// v1 `getMoveFunctionArgTypes` accepted only `Pure` (a by-value primitive) or
	// `Object: ByImmutableReference`. v2 `getMoveFunction` returns each parameter as
	// `{ reference: 'immutable' | 'mutable' | null, body }`, so map equivalently:
	//   immutable ref  -> reference === 'immutable'                  (was ByImmutableReference)
	//   pure by-value  -> reference == null && body is not a datatype (was 'Pure')
	const param = parameters?.[params.argumentIndex];
	const isImmutableRef = param?.reference === 'immutable';
	const isPure = param?.reference == null && param?.body?.$kind !== 'datatype';
	if (!param || (!isImmutableRef && !isPure)) {
		throw new Error(
			`Argument ${params.argumentIndex} of ${params.module}::${params.function} is not immutable`
		);
	}
}

/**
 * fetchCoinsUntilAmountReachedOrEnd
 *
 * This function is inspired by the `fetchAllCoins` implementation from the
 * Aftermath Finance SDK (reference: https://github.com/AftermathFinance/aftermath-ts-sdk/blob/74087402caf5ebf06f6c639cc5e23445d40a039f/src/packages/coin/api/coinApi.ts#L85).
 *
 * It retrieves a list of coins associated with a specified wallet address and coin type until
 * either the target coin amount is reached or no more coins are available. The function returns
 * an object containing the collected coins and the cumulative sum of their values.
 *
 * @param inputs - An object containing the following properties:
 *    - walletAddress: The address of the wallet to fetch coins from.
 *    - coinType: The type of coin to filter for during retrieval.
 *    - coinAmount: The target coin amount to reach.
 *
 * @param suiClient - An instance of `SuiGrpcClient` used to interact with the Sui blockchain.
 *
 * @returns A Promise that resolves to an object containing:
 *    - coins: An array of CoinStruct objects representing the retrieved coins.
 *    - sum: The cumulative value of the retrieved coins.
 */
export async function fetchAllCoins(
	inputs: {
		walletAddress: string;
		coinType: string;
		coinAmount: bigint;
	},
	suiClient: SuiGrpcClient
): Promise<{
	coins: SuiCoin[];
	sum: bigint;
}> {
	let allCoinData: SuiCoin[] = [];
	let currentSum = BigInt(0);
	let cursor: string | null = null;
	do {
		const paginatedCoins = await suiClient.listCoins({
			owner: inputs.walletAddress,
			coinType: inputs.coinType,
			cursor,
		});

		const coinData: SuiCoin[] = paginatedCoins.objects
			.map((c) => ({
				coinObjectId: c.objectId,
				balance: c.balance ?? '0',
				coinType: inputs.coinType,
			}))
			.filter((coin) => BigInt(coin.balance) > BigInt(0));
		allCoinData = [...allCoinData, ...coinData];

		coinData.forEach((coin) => {
			currentSum += BigInt(coin.balance);
		});

		if (
			paginatedCoins.objects.length === 0 ||
			!paginatedCoins.hasNextPage ||
			!paginatedCoins.cursor ||
			currentSum >= inputs.coinAmount
		)
			return {
				coins: allCoinData.sort((b, a) =>
					Number(BigInt(b.coinObjectId) - BigInt(a.coinObjectId))
				),
				sum: currentSum,
			};

		cursor = paginatedCoins.cursor;
	} while (true);
}


/**
 * Fetches the latest Mayan Sui package ID from a shared state object on the Sui blockchain.
 *
 * By Mayan standards:
 * - The latest package ID is stored in a shared state object to avoid forced SDK updates during package upgrades.
 * - The shared state object ID is hardcoded in the SDK to ensure security.
 * - Upgrades to Mayan packages require multiple signatures to perform, enhancing governance and security.
 *
 * @param {string} stateObjectId - The ID of the shared state object containing the latest package ID.
 * @param {SuiGrpcClient} suiClient - An instance of the SuiGrpcClient used to interact with the Sui blockchain.
 * @returns {Promise<string>} - A promise that resolves to the latest Mayan Sui package ID.
 * @throws {Error} - Throws an error if the state object cannot be fetched or if the `latest_package_id` field is not found.
 */
export async function fetchMayanSuiPackageId(
	stateObjectId: string,
	suiClient: SuiGrpcClient
): Promise<string> {
	let json: Record<string, any> | null;
	try {
		// v2 gRPC `getObject({ include: { json: true } })` returns a flat Move-struct
		// map on `object.json` (no v1 `data.content.fields` wrapper).
		const { object } = await suiClient.getObject({
			objectId: stateObjectId,
			include: { json: true },
		});
		json = (object?.json ?? null) as Record<string, any> | null;
	} catch (err) {
		throw new Error(`Failed to fetch Mayan Sui package ID: \n\n ${err}`);
	}
	if (json?.latest_package_id) {
		return json.latest_package_id as string;
	}
	throw new Error('latest_package_id not found in Mayan Sui state object');
}

export async function resolveInputCoin(
	amount: bigint,
	owner: string,
	coinType: string,
	suiClient: SuiGrpcClient,
	tx: Transaction,
	preparedCoin?: SuiFunctionParameter | null
) {
	let inputCoin:
		| TransactionResult
		| SuiFunctionNestedResult
		| { $kind: 'Input'; Input: number; type?: 'object' };
	if (preparedCoin?.result) {
		inputCoin = preparedCoin.result;
	} else if (preparedCoin?.objectId) {
		inputCoin = tx.object(preparedCoin.objectId);
	} else {
		const { coins, sum } = await fetchAllCoins(
			{
				walletAddress: owner,
				coinType: coinType,
				coinAmount: amount,
			},
			suiClient
		);
		if (sum < amount) {
			throw new Error(
				`Insufficient funds to create Coin ${coinType} with amount ${amount}`
			);
		}
		if (coins.length > 1) {
			tx.mergeCoins(
				coins[0].coinObjectId,
				coins.slice(1).map((c) => c.coinObjectId)
			);
		}
		const [spitedCoin] = tx.splitCoins(coins[0].coinObjectId, [amount]);
		inputCoin = spitedCoin;
	}
	return inputCoin;
}
