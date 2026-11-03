const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const {
	Connection,
	Keypair,
	Transaction,
	SystemProgram,
} = require('@solana/web3.js');
const bs58 = require('bs58').default;
const { submitTransactionWithRetry, wrapSol } = require('../dist/index.js');

async function withRpc(options, run) {
	const payer = Keypair.generate();
	const blockhash = Keypair.generate().publicKey.toBase58();
	const servers = [];
	const counts = [];
	let signedBytes;
	async function start(role) {
		const count = { sends: 0, statuses: 0 };
		counts.push(count);
		const server = createServer(async (req, res) => {
			try {
				const chunks = [];
				for await (const chunk of req) chunks.push(chunk);
				const { id, method, params } = JSON.parse(
					Buffer.concat(chunks).toString()
				);
				const reply = { jsonrpc: '2.0', id };
				if (method === 'getLatestBlockhash') {
					reply.result = {
						context: { slot: 1000 },
						value: { blockhash, lastValidBlockHeight: 1150 },
					};
				} else if (method === 'getAccountInfo') {
					reply.result = { context: { slot: 1000 }, value: null };
				} else if (method === 'sendTransaction') {
					count.sends++;
					const bytes = Buffer.from(params[0], 'base64');
					const tx = Transaction.from(bytes);
					assert.equal(tx.verifySignatures(), true);
					if (signedBytes) assert.deepEqual(bytes, signedBytes);
					signedBytes = bytes;
					const fail = options.fail(role, count.sends);
					if (fail === 'hang') return;
					if (fail === 'http') {
						res.writeHead(503);
						res.end('Temporarily unavailable');
						return;
					}
					if (fail) reply.error = { code: -32603, message: 'Internal error' };
					else reply.result = bs58.encode(tx.signature);
				} else if (method === 'getSignatureStatuses') {
					count.statuses++;
					const confirmed = count.statuses >= (options.confirmAt ?? 2);
					reply.result = {
						context: { slot: 1001 },
						value: [
							{
								slot: 1000,
								confirmations: confirmed ? 1 : 0,
								confirmationStatus: confirmed ? 'confirmed' : 'processed',
								err: null,
							},
						],
					};
				} else throw new Error(`Unexpected RPC ${method}`);
				res.writeHead(200, { 'content-type': 'application/json' });
				res.end(JSON.stringify(reply));
			} catch (error) {
				res.writeHead(500);
				res.end(error.stack);
			}
		});
		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		servers.push(server);
		return `http://127.0.0.1:${server.address().port}`;
	}
	const primary = await start('primary');
	const extraRpcs = options.extra ? [await start('secondary')] : [];
	const connection = new Connection(primary, {
		commitment: 'confirmed',
		disableRetryOnRateLimit: true,
	});
	const tx = new Transaction({
		feePayer: payer.publicKey,
		blockhash,
		lastValidBlockHeight: 1150,
	});
	tx.add(
		SystemProgram.transfer({
			fromPubkey: payer.publicKey,
			toPubkey: Keypair.generate().publicKey,
			lamports: 1,
		})
	);
	tx.sign(payer);
	try {
		return await run({
			payer,
			connection,
			counts,
			send: () =>
				submitTransactionWithRetry({
					trx: tx.serialize(),
					connection,
					extraRpcs,
					errorChance: 1,
					rate: 3,
				}),
		});
	} finally {
		for (const server of servers) server.closeAllConnections();
		await Promise.all(
			servers.map((server) => new Promise((resolve) => server.close(resolve)))
		);
	}
}

describe(
	'submitTransactionWithRetry',
	{ concurrency: true, timeout: 20000 },
	() => {
		for (const fault of ['rpc', 'http']) {
			test(`keeps polling after a ${fault} resend failure`, async () => {
				await withRpc(
					{ fail: (_role, attempt) => (attempt > 1 ? fault : false) },
					async ({ send, counts }) => {
						const result = await send();
						assert.ok(result.signature);
						assert.equal(counts[0].sends, 2);
						assert.equal(counts[0].statuses, 2);
					}
				);
			});
		}
		test('handles a rejected resend when another RPC accepts it', async () => {
			await withRpc(
				{
					extra: true,
					fail: (role, attempt) => role === 'secondary' && attempt > 1,
				},
				async ({ send, counts }) => {
					assert.ok((await send()).signature);
					assert.deepEqual(
						counts.map((c) => c.sends),
						[2, 2]
					);
				}
			);
		});
		test('does not wait for a hung resend before observing confirmation', async () => {
			await withRpc(
				{ fail: (_role, attempt) => (attempt > 1 ? 'hang' : false) },
				async ({ send, counts }) => {
					assert.ok((await send()).signature);
					assert.equal(counts[0].statuses, 2);
				}
			);
		});
		test('preserves initial submission rejection when no RPC accepts the transaction', async () => {
			await withRpc({ fail: () => true }, async ({ send }) => {
				await assert.rejects(send);
			});
		});
		test('preserves successful initial sends and stops resending once confirmed', async () => {
			await withRpc(
				{ confirmAt: 1, fail: () => false },
				async ({ send, counts }) => {
					assert.ok((await send()).signature);
					assert.equal(counts[0].sends, 1);
				}
			);
		});
		test('handles resend errors through the public wrapSol entry point', async () => {
			await withRpc(
				{ fail: (_role, attempt) => attempt > 1 },
				async ({ payer, connection, counts }) => {
					const result = await wrapSol(
						payer.publicKey,
						0.001,
						async (tx) => {
							tx.sign(payer);
							return tx;
						},
						connection
					);
					assert.ok(result.signature);
					assert.equal(counts[0].statuses, 2);
				}
			);
		});
	}
);
