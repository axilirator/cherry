/*
	Copyright (C) 2014-2015 WMN aka Yanitskiy Vadim
	
	This is part of cherry.
	https://github.com/axilirator/cherry

	Cherry is free software: you can redistribute it and/or modify
	it under the terms of the GNU General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.

	Cherry is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
	GNU General Public License for more details.

	You should have received a copy of the GNU General Public License
	along with cherry. If not, see <http://www.gnu.org/licenses/>.
*/

// Инициализация глобальных параметров //
var fs = require( 'fs' );

/**
 * Выполняет замену %s на аргументы args по порядку.
*/
function prepare( args ) {
	var counter = 1;

	return function( found ) {
		if ( found === '\n' ) {
			return '';
		} else {
			return args[ counter++ ];
		}
	};
}

var fn = {
	'printf': function( type, message ) {
		// Добавление индикатора сообщения: [+], [-], [#], [!] //
		switch ( type ) {
			case 'log':
				message = '[+] ' + message;
				break;

			case 'warn':
				message = '[-] ' + message;
				break;

			case 'error':
				message = '[!] ' + message;
				break;

			default:
				if ( !global.DEBUG ) return;
				message = '[#] ' + message;
		}

		// Создание массива аргументов //
		var length = arguments.length;
		var args   = [ '  ' + message ];

		if ( length > 2 ) {
			for ( var i = 2; i < length; i++ ) {
				args.push( arguments[ i ] );
			}
		}

		// Вызов нативной функции //
		if ( type === 'debug' && global.DEBUG ) {
			console.info.apply( console, args );
		} else {
			console[ type ].apply( console, args );
		}

		// Логгинг //
		/*if ( global.ENABLE_LOG ) {
			var date = new Date;
			var now  = '[ ' 
				+ date.getDate()     + '.'
				+ date.getMonth() +1 + '.'
				+ date.getFullYear() + ' '
				+ date.getHours()    + ':'
				+ date.getMinutes()  + ':'
				+ date.getSeconds()  + ' ] ';

			message = message.replace( /(\n|%s)/g, prepare( args ) );

			// Запись события в файл //
			fs.appendFile( cfg.log_file, now + message + '\n', function( err ){
				if ( err ) {
					console.error( '  [!] Error writing to log file!' );
					process.exit( 1 );
				}
			});
		}*/
	},

	'random': function( max ) {
		return Math.floor( Math.random() * max );
	},

	/**
	 * Читает файл конфигурации в формате JSON в объект target.
	 *
	 * @param  {object}  fs     Библиотека взаимодействия с файловой системой
	 * @param  {string}  path   Путь к файлу конфигурации
	 * @param  {object}  target Объект, которому присваиваются прочитанные директивы
	 * @return {number} 		Успешность чтения конфигурации:
	 *							true - успех, 404 - файл не найден, 500 - ошибка парсинга 
	 */
	'read_cfg': function( fs, path, target ) {
		try {
			var cfg = fs.readFileSync( path, 'utf8' );

			// Удаляем комментарии //
			cfg = cfg.replace( /\/\/.*$/gm, '' );

			try {
				cfg = JSON.parse( cfg );

				for ( var i in cfg ) {
					target[ i ] = cfg[ i ];
				}

				return true;
			} catch( e ) {
				return 500;
			}
		} catch( e ) {
			return 404;
		}
	},

	/**
	 * Инициализирует базовую конфигурацию и корректирует ее пользовательской.
	 *
	 * @param  {object} fs    Библиотека взаимодействия с файловой системой
	 * @param  {string} path  Путь к файлу конфигурации
	 * @param  {object} argv  Объект параметров командной строки
	 * @return {object} 	  Итоговый файл конфигурации
	 */
	'init_cfg': function( fs, argv, path ) {
		var config = {};

		// Чтение базовой конфигурации //
		if ( this.read_cfg( fs, path + '.defaults', config ) !== true ) {
			this.printf( 'error', 'Default configuration corrupted!' );
			return false;
		}
		
		// Чтение пользовательской конфигурации //
		switch ( this.read_cfg( fs, path, config ) ) {
			case 404:
				this.printf( 'warn', 'Configuration file not found, using default settings' );
			break;

			case 500:
				this.printf( 'error', 'Configuration file parsing error! Check syntax.' );
				return false;
		}

		// Применение параметров командной строки //
		for ( var i in argv ) {
			config[ i ] = argv[ i ];
		}

		return config;
	}
};

// Чтение глобальной пользовательской конфигурации //
module.exports = fn;