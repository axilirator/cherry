var cli    = require( '../cayman.js' );
var result = true; // Результат теста

cli
	.meta( 'name',      'cayman' )
	.meta( 'version',   '1.0.0' )
	.meta( 'copyright', '(C) 2014-2015 Яницкий Вадим' )
	.meta( 'url',       'https://github.com/axilirator/cayman' )
	.meta( 'license',   'This code is distributed under the MIT license' )

	// Global options //
	.option({
		'short_name'  : 'f',
		'full_name'   : 'first-option',
		'access_name' : 'first_option',
		'description' : 'First global option description'
	})
	.option({
		'short_name'  : 'g',
		'full_name'   : 'global-option',
		'access_name' : 'global_option',
		'description' : 'Second global option description'
	});

cli
	.command( 'test_1',     'Проверка парсинга локальных и глобальных опций' )
		.option({
			'short_name'  : 'f',
			'full_name'   : 'local-option',
			'access_name' : 'local_option',
			'description' : 'First local option description'
		})
		.action(function( argv ){
			if ( argv.global_option === 'global' && argv.local_option === 'local' ) {
				console.log( '      [+] Тест успешно пройден!' );
			} else {
				console.error( '      [!] Тест не пройден!' );
				result = false;
			}
		})
	.command( 'test_2',     'Проверка доступности контекста вызова' )
		.option({
			'short_name'  : 'l',
			'full_name'   : 'local-option',
			'access_name' : 'local_option',
			'description' : 'First local option description'
		})
		.action(function( argv ){
			if ( this.argv && argv.local_option === 'value' && this.argv.local_option === 'value' ) {
				console.log( '      [+] Тест успешно пройден!' );
			} else {
				console.error( '      [!] Тест не пройден!' );
				result = false;
			}
		});

// Вывод заголовка //
cli.header();
cli.header = function(){};

cli.help();
console.log();

// node test.js test_1 -g global --first-option local //
console.log( '  [-] Проверка парсинга локальных и глобальных опций' );
cli.parse([
	'node', 'test.js', 'test_1',
		'-g',             'global',
		'--local-option', 'local'
]);

console.log( '  [-] Проверка доступности контекста вызова' );
cli.parse([
	'node', 'test.js', 'test_2',
		'--local-option', 'value'
]);

console.log( '\n  %s\n', result ? '[+] Все тесты успешно пройдены!' : '[!] Тесты не пройдены!' )