import { Format, defineConfig } from 'tsup';

// const format =

export default defineConfig((options) => {
	const format: Format[] = ['cjs', 'esm']
	if (options.minify) format.push('iife')

	return {
		entry: ['src/index.ts'],
		splitting: false,
		sourcemap: false,
		clean: false,
		outDir: 'dist',
		dts: options.minify,
		format,
		outExtension: options.minify ? ({ format }) => {
			return {
				js: `.${format}.min.js`,
			};
		} : undefined,
		...options,
	};
});
