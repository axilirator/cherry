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

var net      = require( 'net' );
var fs       = require( 'fs' );

var fn       = require( './fn.js' );
var chain    = require( './chains.js' );
var protocol = require( './master_protocol.js' );

var CONFIG   = 'config/slave.conf';

// Обработчик сигнала SIGINT //
process.on('SIGINT',
	function() {
		console.log( '\n\nDO THIS!' );
		process.exit( 0 );
	}
);

/**
 * Метод отправки JSON-сообщения.
 * Каждый параметр является отдельным сообщением.
*/
net.Socket.prototype.writeJSON = function() {
	for ( var i = 0; i < arguments.length; i++ ) {
		this.write( JSON.stringify( arguments[ i ] ) );
	}
};

/**
 * Основной класс модуля.
 * @constructor
 */
function slave( argv ) {
	this.ip         = null;  // IP-адрес master-node
	this.connected  = false; // Статус подключения
	this.dictionary = null;  // Драйвер словаря
	this.tool       = null;  // Драйвер инструмента перебора паролей
	this.speed      = 0;     // Скорость перебора паролей
	this.config     = {};    // Конфигурация узла
	this.argv       = argv;  // Аргументы командной строки
}

/**
 * Стартер класса.
 */
slave.prototype.bootstrap = function( config ) {
	var self = this;
	var main = new chain([
		function( chain ) {
			fn.printf( 'log', 'Bootstraping...' );
			fn.printf( 'debug', 'Reading configuration...' );
			chain.next();
		},

		// Чтение конфигурации //
		fn.read_json( CONFIG, self.config ),

		// Модификация параметрами командной строки //
		function( chain ) {
			fn.printf( 'debug', 'Reading command line arguments...' );

			for ( var i in self.argv ) {
				self.config[ i ] = self.argv[ i ];
			}

			chain.next();
		},

		// Проверка конфигурации //
		function( chain ) {
			fn.printf( 'debug', 'Checking configuration...' );
			if ( self.check_config( self.config ) ) {
				if ( !self.config.async ) {
					chain.next();
				} else {
					self.load_tool_driver().then( chain.skip );
				}
			}
		},

		function( chain ) {
			fn.printf( 'log', 'Loading dictionary driver...' );

			self.dictionary = new fn.file( self.config.dictionary );

			// Асинхронные действия :) //
			Promise.all([
				// Загрузка драйвера инструмента перебора паролей //
				self.load_tool_driver(),

				// Загрузка словаря //
				self.dictionary.info(),
				self.dictionary.calculate_checksum()
			]).then( chain.next ).catch(
				function( error ) {
					if ( e.error === 'NaF' ) {
						fn.printf( 'error', "'%s' is not a file", e.path );
					} else {
						fn.printf( 'error', "Cannot read file '%s'", e.path );
					}
				}
			);
		},

		// Запуск сервера //
		function( chain ) {
			fn.printf( 'log', 'Cracking speed: %s PMKs/s', self.speed );
			fn.printf( 'debug', 'Starting server...' );

			self.connect();
		}
	]);

	main.onError(
		function( e ) {
			switch ( e ) {
				case 'read_error':
					fn.printf( 'error', 'Cannot read configuration file!' );
					break;

				case 'parsing_error':
					fn.printf( 'error', "Cannot parse configuration file '%s'. Check syntax", CONFIG );
					break;
			}
		}
	).run();
};

/**
 * Проверяет правильность конфигурации.
 */
slave.prototype.check_config = function( config ) {
	var result = true;

	// Проверка IP адреса //
	var ip_regexp = /[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/;
	if ( typeof config.ip === 'string' && ip_regexp.test( config.ip ) ) {
		fn.printf( 'debug', 'Master\'s IP set to %s', config.ip );
	} else {
		if ( config.ip === false ) {
			fn.printf( 'error', 'IP address of the server is not set' );
		} else {
			fn.printf( 'error', 'Incorrect IP address of the server' );
		}

		result = false;
	}

	// Проверка порта //
	if ( config.port > 0 && config.port <= 49151 ) {
		fn.printf( 'debug', 'Master\'s port set to %s', config.port );
	} else {
		fn.printf( 'error', "Incorrect port number '%s'", config.port );
		result = false;
	}

	// Проверка пароля //
	if ( typeof config.secret === 'string' ) {
		if ( config.secret.length > 0 && config.secret.length < 21 ) {
			fn.printf( 'debug', 'Using secure authentication' );
		} else {
			fn.printf( 'error', 'Incorrect secret length' );
			result = false;
		}
	} else {
		if ( config.secret !== false ) {
			fn.printf( 'error', 'Incorrect secret format. Use string or false' );
			result = false;
		}
	}

	// Проверка флага асинхронности //
	if ( typeof config.async === 'boolean' ) {
		fn.printf( 'debug',
			config.async ? 'Asynchronous node' : 'Synchronous node'
		);
	} else {
		fn.printf( 'error', 'Incorrect value for async: it can be true or false only' );
		result = false;
	}

	// Проверка словаря //
	if ( config.async === false ) {
		if ( typeof config.dictionary === 'string' && config.dictionary.length > 0 ) {
			fn.printf( 'debug', "Dictionary path: '%s'", config.dictionary );
		} else {
			if ( config.dictionary === false ) {
				fn.printf( 'error', 'Dictionary path is not set' );
			} else {
				fn.printf( 'error', 'Incorrect dictionary path' );
			}

			result = false;
		}
	}

	// Проверка параметров инструмента перебора паролей //
	if ( typeof config.tool === 'object' ) {
		if ( typeof config.tool.name === 'string' && typeof config.tool.path === 'string' ) {
			// Все ок! //
		} else {
			fn.printf( 'error', 'Cracking tool is not set' );
			result = false;
		}
	} else {
		fn.printf( 'error', 'Configuration error! \'tool\' directive must be object' );
		result = false;
	}

	return result;
};

/**
 * Выполняет поиск и выбор инструмента для атаки.
 */
slave.prototype.load_tool_driver = function() {
	var self = this;

	return new Promise(
		function( resolve, reject ) {
			fn.printf( 'log', 'Searching cracking tool driver...' );

			var drivers = require( './drivers.js' );
			var driver  = drivers.search( self.config.tool.name );

			// Проверка наличия требуемого драйвера //
			if ( driver ) {
				self.tool   = driver;
				driver.path = self.config.tool.path;

				var main = new chain([
					// Поиск инструмента в системе //
					driver.search(),

					// Инструмент найден, получение скорости //
					function( chain, storage ) {
						fn.printf( 'log', 'Loading cracking tool driver...' );

						// Если скорость уже задана в конфигурации //
						if ( self.config.tool.speed ) {
							storage.speed = self.config.tool.speed;
							chain.skip();
						} else {
							chain.next();
						}
					},

					// Выполнение теста производительности //
					function( chain, storage ) {
						fn.printf( 'log', 'Running benchmark...' );

						driver.benchmark().then(
							function( speed ) {
								storage.speed = speed;
								chain.next();
							}
						);
					},

					// Запись результатов //
					function( chain, storage ) {
						if ( storage.speed > 0 && storage.speed < 1000000 ) {
							self.speed = storage.speed;
							resolve();
						} else {
							fn.printf( 'error', 'Incorrect speed value! Check your cracking tool' );
							reject();
						}
					}
				]);

				main.onError(
					function( e ) {
						switch ( e ) {
							case 'not_found':
								fn.printf( 'error', 'Tool was not found on this system' );
								break;

							case 'die':
								fn.printf( 'error', 'Cracking tool unexpectedly died' );
								break;

							case 'benchmark':
								fn.printf( 'error', 'Benchmarking error' );
								break;

							default:
								fn.printf( 'error', 'Unhandled error' );
						}

						fn.printf( 'warn', 'Use --debug mode for details' );
						reject();
					}
				).run();
			} else {
				fn.printf( 'error', 'Cannot find a driver' );
			}
		}
	);
};

/**
 * Подключает узел к серверу
 */
slave.prototype.connect = function() {
	var worker      = this;
	var master_ip   = this.config.ip;
	var master_port = this.config.port;

	fn.printf( 'log', 'Connecting to %s...', master_ip );

	var connection = net.connect( { 'host': master_ip, 'port': master_port }, function(){
		fn.printf( 'log', 'Successfully connected to %s, now joining...', master_ip );
	});

	connection.on( 'error', function(){
		fn.printf( 'error', 'Cannot connect to %s:%s', master_ip, master_port );
	});

	// Обработчик поступающих от master-node данных //
	connection.on( 'data', function( data ){
		var response = data.toString().trim();
		var header   = null;

		// Данные, которые не удалось распарсить, не обрабатываются //
		try {
			// Парсинг JSON //
			response = JSON.parse( response );
			header   = response.header;
		} catch ( e ) {}

		// Вызвать обработчик соответствующей команды //
		if ( header in protocol ) {
			protocol[ header ]( worker, response, connection );
		}
	});

	// Обработчик разрыва соединения //
	connection.on( 'end', function(){
		fn.printf( 'warn', 'Disconnected from master-node' );
	});
};

module.exports = slave;