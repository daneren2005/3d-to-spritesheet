import js from '@eslint/js';
import globals from 'globals';
import eslintPluginVue from 'eslint-plugin-vue';

export default [
	{
		ignores: ['dist/**', 'public/pngquant/**']
	},
	js.configs.recommended,
	...eslintPluginVue.configs['flat/essential'],
	{
		files: ['**/*.{js,mjs,cjs,vue}'],
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module',
			globals: {
				...globals.browser,
				...globals.node
			}
		},
		rules: {
			'no-console': process.env.NODE_ENV === 'production' ? ['error', { allow: ['warn', 'error'] }] : 'off',
			'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
			'no-unused-vars': 'off',
			'no-empty': process.env.NODE_ENV === 'production' ? 'error' : 'off',
			'no-case-declarations': 'off',
			semi: 'error',
			indent: [
				'error',
				'tab',
				{
					SwitchCase: 1,
					ignoredNodes: ['TemplateLiteral']
				}
			],
			'comma-dangle': ['error', 'never'],
			'prefer-const': 'off',
			'vue/multi-word-component-names': 'off'
		}
	}
];
