const dts = require('rollup-plugin-dts').default;

module.exports = [
	{
		input: 'lib/index.js',
		// https://github.com/rollup/rollup/wiki/Troubleshooting#this-is-undefined
		context: 'this',
		watch: { clearScreen: false },
		output: [
			{
				file: 'dist/main.umd.js',
				compact: true,
				name: 'MAYAN',
				format: 'umd',
				exports: 'named',
			},
			{
				file: 'dist/main.amd.js',
				compact: true,
				format: 'amd',
				exports: 'named',
			},
			{
				file: 'dist/main.cjs.js',
				compact: true,
				format: 'cjs',
				exports: 'named',
			},
			{
				file: 'dist/main.esm.js',
				compact: true,
				format: 'es',
				exports: 'named',
			},
		],
	},
	{
		input: './lib/index.d.ts',
		watch: { clearScreen: false },
		output: [{ file: 'dist/main.d.ts', format: 'es' }],
		plugins: [dts()],
	},
];
