/*
 *	Copyright (C) 2014-2015 Яницкий Вадим
 *	cayman 1.1.0 - Simple CLI for Node.js and io.js
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

// Массив действий, привязанных к параметрам //
var actions_quee = [];

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
	this.options  = [];     // Глобальные параметры
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
	};

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
		'description' : params.description,
		'action'      : params.action
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
	// Вывод синтаксиса //
	if ( this.info.usage ) {
		console.log( '  Usage: ' + this.info.usage );
	} else {
		console.log( '  Usage: ' + this.info.name + ' <command> [options]' );
	}

	var max_short_len = 0;
	var max_full_len  = 0;

	var full_spaces, short_spaces;
	var full_difference, short_difference;
	var i, j;

	// Если в программе есть хоть одна команда, вывести описание //
	if ( this.cmd ) {
		console.log( '\n  Commands:' );
		
		// Максимальные длины названий команд и параметров //
		var max_cmd_len = 0;
		var cmd_difference;
		var cmd_spaces;
		var cmd_options;

		// Перебор команд программы //
		for ( i in this.commands ) {
			// Поиск максимальной длины названия команды //
			if ( i.length > max_cmd_len ) {
				max_cmd_len = i.length;
			}

			cmd_options = this.commands[ i ].options;

			// Если у команды есть параметры //
			if ( cmd_options.length ) {				
				// Перебор параметров команды //
				for ( j = 0; j < cmd_options.length; j++ ) {
					if ( cmd_options[ j ].short_name.length > max_short_len ) {
						max_short_len = cmd_options[ j ].short_name.length;
					}

					if ( cmd_options[ j ].full_name.length > max_full_len ) {
						max_full_len  = cmd_options[ j ].full_name.length;
					}
				}
			}
		}

		// Вывод команд //
		for ( i in this.commands ) {
			// Вывод названия команды //
			process.stdout.write( '    ' + i );

			// Выравнивание //
			cmd_difference = max_cmd_len - i.length;
			cmd_spaces     = '';
			while ( cmd_difference-- ) {
				cmd_spaces += ' ';
			}

			// Вывод описания команды //
			process.stdout.write( cmd_spaces + ' : ' + this.commands[ i ].description + '\n' );

			// Вывод параметров, связанных с командой //
			cmd_options = this.commands[ i ].options;

			if ( cmd_options.length ) {
				// Перебор параметров //
				for ( j = 0; j < cmd_options.length; j++ ) {
					// Рассчет отступа //
					full_difference  = max_full_len  - cmd_options[ j ].full_name.length;
					short_difference = max_short_len - cmd_options[ j ].short_name.length;
					full_spaces      = short_spaces = '';

					while ( full_difference-- ) {
						full_spaces  += ' ';
					}

					while ( short_difference-- ) {
						short_spaces += ' ';
					}

					// Вывод полного названия параметра //
					process.stdout.write( '      --' + cmd_options[ j ].full_name );

					// Если имеется краткое название параметра //
					if ( cmd_options[ j ].short_name.length ) {
						process.stdout.write( ',' + full_spaces + ' -' + cmd_options[ j ].short_name + short_spaces );
					} else {
						process.stdout.write( full_spaces + '   ' + short_spaces );
					}

					// Вывод описания //
					process.stdout.write( ' : ' + cmd_options[ j ].description + '\n' );
				}
			}
		}
	}

	// Вывод глобальных параметров программы //
	if ( this.options.length ) {
		var global_options = this.options;
		max_short_len      = 0;
		max_full_len       = 0;

		console.log( '\n  Global options:' );
		
		// Рассчет максимальной длины параметров //
		for ( i = 0; i < global_options.length; i++ ) {
			if ( global_options[ i ].short_name.length > max_short_len ) {
				max_short_len = global_options[ i ].short_name.length;
			}

			if ( global_options[ i ].full_name.length > max_full_len ) {
				max_full_len  = global_options[ i ].full_name.length;
			}
		}

		// Перебор глобальных параметров //
		for ( i = 0; i < global_options.length; i++ ) {
			// Рассчет отступов //
			full_difference  = max_full_len  - global_options[ i ].full_name.length;
			short_difference = max_short_len - global_options[ i ].short_name.length;
			full_spaces      = short_spaces = '';

			while ( full_difference-- ) {
				full_spaces  += ' ';
			}

			while ( short_difference-- ) {
				short_spaces += ' ';
			}

			// Вывод полного названия глобального параметра //
			process.stdout.write( '    --' + global_options[ i ].full_name );

			// Если имеется краткое название параметра //
			if ( global_options[ i ].short_name.length ) {
				process.stdout.write( ',' + full_spaces + ' -' + global_options[ i ].short_name + short_spaces );
			} else {
				process.stdout.write( full_spaces + '   ' + short_spaces );
			}

			// Вывод описания глобального параметра //
			process.stdout.write( ' : ' + global_options[ i ].description + '\n' );
		}
	}
};

/**
 * Метод, выполняющий программу.
 * @param {object} argv Массив переданных при запуске параметров
 */
cayman.prototype.parse = function( argv ) {
	// Заголовок программы //
	this.header();

	if ( argv.length === 2 ) {
		// Программа вызвана без аргументов //
		this.help();
	} else {
		// Определение команды //
		if ( this.commands[ argv[ 2 ] ] ) {
			this.cmd  = this.commands[ argv[ 2 ] ];
			this.argv = parse_arguments.call( this, argv );

			// Если удалось распарсить параметры программы //
			if ( this.argv ) {
				// Выполнение действий, связанных с параметрами //
				for ( var i = 0; i < actions_quee.length; i++ ) {
					actions_quee[ i ].action( actions_quee[ i ].value );
				}

				// Выполнение выбранной команды //
				if ( this.cmd.action ) {
					this.cmd.action.call( this, this.argv );
				}
			} else {
				console.log();
			}
		} else {
			console.log( '  Command not found, see help.' );
		}
	}
};

/**
 * Выполняет парсинг массива параметров в результирующий
 * объект согласно описанию этих параметров. 
 * @param  {object} argv Массив переданных при запуске параметров
 * @return {object} 	 Результат парсинга
 */
function parse_arguments( argv ) {
	var parsed       = {};
	var current      = false;
	var name         = false;
	var unrecognized = false;
	var have_action  = false;
	var is_global    = false;
	var name_format, option;

	var i, j;

	for ( i = 3, len = argv.length; i < len; i++ ) {
		// Параметр или значение? //
		if ( argv[ i ][ 0 ] === '-' ) {
			// Объявление параметра //
			 
			// Сброс буфера имени текущего параметра //
			current     = false;

			// Сброс флага наличия связанного действия //
			have_action = false;
			
			// Полное или краткое название параметра? // 
			if ( argv[ i ][ 1 ] === '-' ) {
				// Полное //
				name        = argv[ i ].substr( 2 );
				name_format = 'full_name';
			} else {
				// Краткое //
				name        = argv[ i ].substr( 1 );
				name_format = 'short_name';
			}

			// Перебор параметров текущей команды //
			for ( j = 0; j < this.cmd.options.length; j++ ) {
				if ( this.cmd.options[ j ][ name_format ] === name ) {
					parsed[ this.cmd.options[ j ].access_name ] = true;
					current = this.cmd.options[ j ].access_name;
					option  = this.cmd.options[ j ];
					break;
				}
			}

			// Если параметр не принадлежит выполняемой команде //
			if ( !current ) {
				// Перебор глобальных параметров //
				for ( j = 0; j < this.options.length; j++ ) {
					if ( this.options[ j ][ name_format ] === name ) {
						parsed[ this.options[ j ].access_name ] = true;
						current = this.options[ j ].access_name;
						option  = this.options[ j ];
						break;
					}
				}	
			}

			// Если параметр определен в описании программы //
			if ( current ) {
				// Если параметр требует выполнения некой функции //
				if ( option.action ) {
					have_action = true;
					actions_quee.push({
						'action' : option.action,
						'value'  : parsed[ current ]
					});
				}
			} else {
				// Если текущий параметр не найден нигде, предупреждаем пользователя //
				unrecognized = true;
				console.warn( "  Unrecognized option '%s', see help.", name );
			}
		} else {
			// Объявление значения параметра //
			
			// Если значению предшествует название параметра //
			if ( current ) {
				// Регистрация параметра и его значения //
				parsed[ current ] = argv[ i ];

				// Если параметр имеет связанное действие //
				if ( have_action ) {
					// Регистрация значения параметра //
					actions_quee[ actions_quee.length - 1 ].value = argv[ i ];
				}
			} else {
				// WTF? //
				console.warn( "  Unexpected value '%s' without option, check syntax.", argv[ i ] );
				unrecognized = true;
			}
		}
	}

	return unrecognized ? false : parsed;
}

module.exports = new cayman();