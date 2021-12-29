module.exports = {
	root: true,
	env: {
		node: true
	},
	'extends': [
		'plugin:vue/essential',
		'eslint:recommended'
	],
	rules: {
		'no-console': process.env.NODE_ENV === 'production' ? ['error', { allow: ['warn', 'error'] }] : 'off',
		'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
		'no-unused-vars': 'off',
		'@typescript-eslint/no-unused-vars': process.env.NODE_ENV === 'production' ? 'error' : 'off',
		'no-empty': process.env.NODE_ENV === 'production' ? 'error' : 'off',
		'no-case-declarations': 'off',
		'semi': 'error',
		'indent': [
			'error',
			'tab',
			{
				'SwitchCase': 1,
				'ignoredNodes': [
					'TemplateLiteral'
				]
			}
		],
		'comma-dangle': ['error', 'never'],
		'prefer-const': 'off',
		'vue/multi-word-component-names': 'off'
	}
};
