/*
 *	Copyright (C) 2014-2015 Яницкий Вадим
 *	cayman 1.0.0 - Simple CLI for Node.js
 *	https://github.com/axilirator/cayman
 *
 *	Distributed under the MIT license.
 *	See https://github.com/axilirator/cayman/blob/master/LICENSE
 *
 *	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *	IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *	FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *	AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *	LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *	OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 *	SOFTWARE.
 */


// Strict mode //
 'use strict';

/**
 * Конструктор класса.
 * @constructor
 */
function cayman() {
	this.info = {
		// Метаданные
		'name' : process.argv[ 1 ]
	};

	this.commands = {};     // Команды
	this.options  = [];     // Глобальнае пареметры
	this.argv     = {};     // Прочитанные параметры
	this.cmd      = false;  // Команда, переданная программе
}

/******** Метаданные ********/

/**
 * Определяет метаданные приложения.
 * @param {string} name  Свойство
 * @param {string} value Значение
 * return this
 */
cayman.prototype.meta = function( name, value ) {
	this.info[ name ] = value;
	return this;
};

/******** Команды ********/

/**
 * Объявляет приложения.
 * @param {string} command 		Название команды
 * @param {string} description 	Описание, которое выводится в справке
 * return this
 */
cayman.prototype.command = function( command, description ) {
	var new_command = {
		'options'     : [],
		'name'        : command,
		'action'      : false,
		'description' : description
	}

	this.cmd = this.commands[ command ] = new_command;

	return this;
};

/**
 * До объявления первой команды задает глобальный параметр. 
 * Добавляет локальные параметры к объявляемым командам.
 * @param {object} params Объект, описывающий параметр:
 * 		@sample short_name  Название параметра в виде ключа (-a, -b, -c)
 *		@sample full_name   Полное название параметра (--first, --second)
 *		@sample access_name Название параметра в результирующем объекте
 *		@sample description Описание параметра для справки
 * @return this
 */
cayman.prototype.option = function( params ) {
	var target = this.cmd ? this.cmd.options : this.options;

	target.push({
		'short_name'  : params.short_name || '',
		'full_name'   : params.full_name,
		'access_name' : params.access_name,
		'description' : params.description
	});

	return this;
};

/**
 * Определяет действие, выполняемое командой.
 * @param {function} handler Обработчик команды, получающий параметры первым аргументом
 * @return this
 */
cayman.prototype.action = function( handler ) {
	if ( this.cmd ) {
		this.cmd.action = handler;
	}

	return this;
};

/**
 * Отображает заголовок программы, содержащий метаданные.
 * @return this
 */
cayman.prototype.header = function() {
	var info = this.info;

	process.stdout.write( '\n  ' + info.name );

	if ( info.version )
		process.stdout.write( ' ' + info.version );

	if ( info.copyright )
		process.stdout.write( ' ' + info.copyright );

	process.stdout.write( '\n' );

	if ( info.url )
		console.log( '  ' + info.url );

	if ( info.license )
		console.log( '  ' + info.license );

	process.stdout.write( '\n' );

	return this;
};

/**
 * Отображает справку программы.
 * @return this
 */
cayman.prototype.help = function() {
	// Вывод заголовка программы //
	this.header();

	// Вывод синтаксиса //
	if ( this.info.usage ) {
		console.log( '  Usage: ' + this.info.usage );
	} else {
		console.log( '  Usage: ' + this.info.name + ' <command> [options]' )
	}

	// Если в программе есть хоть одна каманда, вывести их описание //
	if ( this.cmd ) {
		console.log( '\n  Commands:' );

		// Рассчет отступов //
		var max_cmd_clength  = 0;
		var difference       = 0;
		var spaces           = '';

		var max_short        = 0;
		var max_full         = 0;

		var full_difference  = 0;
		var short_difference = 0;

		for ( var i in this.commands ) {
			if ( i.length > max_cmd_clength )
				max_cmd_clength = i.length;

			if ( this.commands[ i ].options.length > 0 ) {
				var cmd_options = this.commands[ i ].options;
				
				for ( var j = 0; j < cmd_options.length; j++ ) {
					if ( cmd_options[ j ].short_name.length > max_short )
						max_short = cmd_options[ j ].short_name.length;

					if ( cmd_options[ j ].full_name.length > max_full )
						max_full  = cmd_options[ j ].full_name.length;
				}
			}
		}

		// Вывод команд //
		for ( var i in this.commands ) {
			process.stdout.write( '    ' + i );

			// Выравнивание //
			difference = max_cmd_clength - i.length;
			spaces     = '';
			while ( difference-- ) {
				spaces += ' ';
			}

			process.stdout.write( spaces + ' : ' + this.commands[ i ].description + '\n' );

			// Вывод опций, связанных с командой //
			var cmd_options = this.commands[ i ].options;

			if ( cmd_options.length > 0 ) {
				var cmd_options = this.commands[ i ].options;
				var full_spaces, short_spaces;

				for ( var j = 0; j < cmd_options.length; j++ ) {
					full_difference  = max_full  - cmd_options[ j ].full_name.length;
					short_difference = max_short - cmd_options[ j ].short_name.length;
					full_spaces      = short_spaces = '';

					while ( full_difference-- )
						full_spaces  += ' ';

					while ( short_difference-- )
						short_spaces += ' ';

					process.stdout.write( '      --' + cmd_options[ j ].full_name );
					if ( cmd_options[ j ].short_name.length ) {
						process.stdout.write( ',' + full_spaces + ' -' + cmd_options[ j ].short_name + short_spaces );
					} else {
						process.stdout.write( full_spaces + '   ' + short_spaces );
					}

					process.stdout.write( ' : ' + cmd_options[ j ].description + '\n' );
				}
			}

			console.log();
		}
	}

	// Вывод глобальных параметров программы //
	if ( this.options.length > 0 ) {
		var global_options = this.options;
		spaces             = '';

		max_short          = 0;
		max_full           = 0;

		full_difference    = 0;
		short_difference   = 0;

		console.log( '  Global options:' );
		
		for ( var i = 0; i < global_options.length; i++ ) {
			if ( global_options[ i ].short_name.length > max_short )
				max_short = global_options[ i ].short_name.length;

			if ( global_options[ i ].full_name.length > max_full )
				max_full  = global_options[ i ].full_name.length;
		}

		for ( var i = 0; i < global_options.length; i++ ) {
			full_difference  = max_full  - global_options[ i ].full_name.length;
			short_difference = max_short - global_options[ i ].short_name.length;
			full_spaces      = short_spaces = '';

			while ( full_difference-- )
				full_spaces  += ' ';

			while ( short_difference-- )
				short_spaces += ' ';

			process.stdout.write( '    --' + global_options[ i ].full_name );
			if ( global_options[ i ].short_name.length ) {
				process.stdout.write( ',' + full_spaces + ' -' + global_options[ i ].short_name + short_spaces );
			} else {
				process.stdout.write( full_spaces + '   ' + short_spaces );
			}

			process.stdout.write( ' : ' + global_options[ i ].description + '\n' );
		}

		console.log();
	}
};

/**
 * Метод, выполняющий программу.
 * @param {object} argv Массив переданных при запуске параметров
 */
cayman.prototype.parse = function( argv ) {
	if ( argv.length === 2 ) {
		this.help();
		return;
	}

	// Заголовок программы //
	this.header();

	// Определение команды //
	if ( this.commands[ argv[ 2 ] ] ) {
		this.cmd  = this.commands[ argv[ 2 ] ];
		this.argv = parse_arguments.call( this, argv );

		if ( this.cmd.action )
			this.cmd.action.call( this, this.argv );
	} else {
		console.log( '  Command not found, see help.\n' );
	}
};

/**
 * Выполняет парсинг массива параметров в результирующий
 * объект согласно описанию этих параметров. 
 * @param  {object} argv Массив переданных при запуске параметров
 * @return {object} 	 Результат парсинга
 */
function parse_arguments( argv ) {
	var current = false;
	var parsed  = {};
	var name    = null;

	for ( var i = 3, len = argv.length; i < len; i++ ) {
		// Параметр или значение? //
		if ( argv[ i ][ 0 ] === '-' ) {
			// Объявление параметра //
			if ( argv[ i ][ 1 ] === '-' ) {
				// full-name //
				name = argv[ i ].substr( 2 );

				// Перебор параметров текущей команды //
				for ( var j = 0; j < this.cmd.options.length; j++ ) {
					if ( this.cmd.options[ j ].full_name === name ) {
						parsed[ this.cmd.options[ j ].access_name ] = true;
						current = this.cmd.options[ j ].access_name;
						break;
					}
				}

				if ( current )
					continue;

				// Перебор глобальных параметров //
				for ( var j = 0; j < this.options.length; j++ ) {
					if ( this.options[ j ].full_name === name ) {
						parsed[ this.options[ j ].access_name ] = true;
						current = this.options[ j ].access_name;
						break;
					}
				}
			} else {
				// short-name //
				name = argv[ i ].substr( 1 );

				// Перебор параметров текущей команды //
				for ( var j = 0; j < this.cmd.options.length; j++ ) {
					if ( this.cmd.options[ j ].short_name === name ) {
						parsed[ this.cmd.options[ j ].access_name ] = true;
						current = this.cmd.options[ j ].access_name;
						break;
					}
				}

				if ( current )
					continue;

				// Перебор глобальных параметров //
				for ( var j = 0; j < this.options.length; j++ ) {
					if ( this.options[ j ].short_name === name ) {
						parsed[ this.options[ j ].access_name ] = true;
						current = this.options[ j ].access_name;
						break;
					}
				}
			}
		} else {
			// Объявление значения параметра //
			if ( current ) {
				parsed[ current ] = argv[ i ];
				current = false;
			}
		}
	}

	return parsed;
}

module.exports = new cayman;