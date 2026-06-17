import { ClientWithCoreApi } from '@mysten/sui/client';
import { SuiFunctionNestedResult, SuiFunctionParameter } from '../types';
import { Transaction, TransactionResult } from '@mysten/sui/transactions';

type SuiCoinRef = { objectId: string; balance: string };

/**
 * assertArgumentIsImmutable
 *
 * Validates whether a specific argument of a given Move function in a Sui module is immutable.
 * This includes checking if the argument type is either a pure (non-object) value or an object
 * passed by immutable reference (`&T`).
 *
 * @param params - An object containing the following properties:
 *    - package: The Sui package containing the Move module.
 *    - module: The name of the Move module.
 *    - function: The name of the Move function to validate.
 *    - argumentIndex: The index of the argument to check for immutability.
 * @param suiClient - Any client implementing the Core API (`SuiGrpcClient`, `SuiJsonRpcClient`, …).
 *
 * @throws Will throw an error if:
 *    - The function signature cannot be retrieved from the Sui client.
 *    - The specified argument is not immutable (i.e., not pure and not passed by immutable reference).
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
	suiClient: ClientWithCoreApi
): Promise<void> {
	let parameters;
	try {
		const res = await suiClient.core.getMoveFunction({
			packageId: params.package,
			moduleName: params.module,
			name: params.function,
		});
		parameters = res.function.parameters;
	} catch (error) {
		throw new Error(
			`Failed to fetch ${params.package}::${params.module}::${params.function} ArgTypes`
		);
	}
	const param = parameters?.[params.argumentIndex];
	if (!param) {
		throw new Error(
			`Failed to fetch package::${params.module}::${params.function} ArgTypes`
		);
	}
	const isImmutable =
		param.reference === 'immutable' ||
		(param.reference === null && param.body?.$kind !== 'datatype');
	if (!isImmutable) {
		throw new Error(
			`Argument ${params.argumentIndex} of ${params.module}::${params.function} is not immutable`
		);
	}
}

/**
 * fetchAllCoins
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
 * @param suiClient - Any client implementing the Core API (`SuiGrpcClient`, `SuiJsonRpcClient`, …).
 *
 * @returns A Promise that resolves to an object containing:
 *    - coins: An array of coin references representing the retrieved coins.
 *    - sum: The cumulative value of the retrieved coins.
 */
export async function fetchAllCoins(
	inputs: {
		walletAddress: string;
		coinType: string;
		coinAmount: bigint;
	},
	suiClient: ClientWithCoreApi
): Promise<{
	coins: SuiCoinRef[];
	sum: bigint;
}> {
	let allCoinData: SuiCoinRef[] = [];
	let currentSum = BigInt(0);
	let cursor: string | null = null;
	do {
		const paginatedCoins = await suiClient.core.listCoins({
			owner: inputs.walletAddress,
			coinType: inputs.coinType,
			cursor,
		});

		const coinData = paginatedCoins.objects.filter(
			(data) => BigInt(data.balance) > BigInt(0)
		);
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
					Number(BigInt(b.objectId) - BigInt(a.objectId))
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
 * @param suiClient - Any client implementing the Core API (`SuiGrpcClient`, `SuiJsonRpcClient`, …).
 * @returns {Promise<string>} - A promise that resolves to the latest Mayan Sui package ID.
 * @throws {Error} - Throws an error if the state object cannot be fetched or if the `latest_package_id` field is not found.
 */
export async function fetchMayanSuiPackageId(
	stateObjectId: string,
	suiClient: ClientWithCoreApi
): Promise<string> {
	let object;
	try {
		object = await suiClient.core.getObject({
			objectId: stateObjectId,
			include: { json: true },
		});
	} catch (err) {
		throw new Error(`Failed to fetch Mayan Sui package ID: \n\n ${err}`);
	}
	const fields = object.object?.json as
		| { latest_package_id?: string }
		| null
		| undefined;
	if (fields?.latest_package_id) {
		return fields.latest_package_id;
	}
	throw new Error('latest_package_id not found in Mayan Sui state object');
}

export async function resolveInputCoin(
	amount: bigint,
	owner: string,
	coinType: string,
	suiClient: ClientWithCoreApi,
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
				coins[0].objectId,
				coins.slice(1).map((c) => c.objectId)
			);
		}
		const [spitedCoin] = tx.splitCoins(coins[0].objectId, [amount]);
		inputCoin = spitedCoin;
	}
	return inputCoin;
}
