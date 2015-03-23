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
var crypto   = require( 'crypto' );

var fn       = require( './fn.js' );
var chain    = require( './chains.js' );
var protocol = require( './master_protocol.js' );

var CONFIG   = 'config/slave.conf';

// Обработчик сигнала SIGINT //
process.on( 'SIGINT',
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
	this.connection = null;  // Ссылка на соединение
	this.connected  = false; // Статус подключения
	this.dictionary = null;  // Драйвер словаря
	this.tool       = null;  // Драйвер инструмента перебора паролей
	this.speed      = 0;     // Скорость перебора паролей
	this.config     = {};    // Конфигурация узла
	this.argv       = argv;  // Аргументы командной строки
	this.chain      = null;  // Цепочка действий узла
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

		// Подключение к серверу //
		function( chain ) {
			fn.printf( 'log', 'Connecting to %s...', self.config.ip );

			self.connect();
		},

		// Загрузка драйверов словаря и инструмента перебора паролей //
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
			]).then(
				function() {
					var size = Math.floor( self.dictionary.size / 1024 );
					fn.printf( 'log', 'Dictionary loaded. Size: %s Mb', size );
					fn.printf( 'log', 'Benchmarking result: %s PMKs/s', self.speed );
					chain.next();
				},

				function( e ) {
					if ( e.error === 'NaF' ) {
						fn.printf( 'error', "'%s' is not a file", e.path );
					} else {
						fn.printf( 'error', "Cannot read file '%s'", e.path );
					}
				}
			);
		},

		// Запрос JOIN //
		function( chain, storage ) {
			fn.printf( 'log', 'Joining the cluster...' );

			self.join( storage.master_params );
		},

		function( chain ) {
			self.request_handshake().then( chain.next );
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

				default:
					throw e;
			}
		}
	).run();

	self.chain = main;
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

	// Проверка порта основного сервера //
	if ( config.main_port > 0 && config.main_port <= 49151 ) {
		fn.printf( 'debug', 'Master\'s main server port set to %s', config.main_port );
	} else {
		fn.printf( 'error', "Incorrect main server port number '%s'", config.main_port );
		result = false;
	}

	// Проверка порта файлового сервера //
	if ( config.fs_port > 0 && config.fs_port <= 49151 ) {
		fn.printf( 'debug', 'Master\'s file server port set to %s', config.fs_port );
	} else {
		fn.printf( 'error', "Incorrect file server port number '%s'", config.fs_port );
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

slave.prototype.join = function( params ) {
	var self = this;

	return new Promise(
		function( resolve, reject ) {
			// Подготовка запроса //
			var join_request = {
				'header'      : 'join',
				'version_num' : global.NUM_VER,
				'version_txt' : global.TXT_VER
			};

			// Если сервер требует предоставить пароль //
			if ( params.secure ) {
				fn.printf( 'log', 'Master requires secure authentication' );

				if ( self.config.secret !== false ) {
					// Если пароль задан //
					var md5sum = crypto.createHash( 'md5' );
					md5sum.update( params.salt.toString() );
					md5sum.update( self.config.secret );

					join_request.secret = md5sum.digest( 'hex' );
				} else {
					fn.printf( 'error', 'You must specify secret for authentication!' );
					self.connection.end();
					return;
				}
			}

			// Информация о словаре //
			if ( !self.config.async ) {
				join_request.async               = false;
				join_request.dictionary_size     = self.dictionary.size;
				join_request.dictionary_checksum = self.dictionary.checksum;
			} else {
				join_request.async               = true;
			}

			// Информация о скорости узла //
			join_request.speed = self.speed;

			// Информация об инструменте //
			join_request.tool  = {
				'name'    : self.tool.name,
				'version' : self.tool.version
			};

			self.connection.writeJSON( join_request );
		}
	);
};

slave.prototype.request_handshake = function() {
	var self = this;

	return new Promise(
		function( resolve, reject ) {
			fn.printf( 'log', 'Connecting to file server...' );

			// Подключение к файловому серверу //
			var connection = net.connect(
				{
					'host' : self.config.ip,
					'port' : self.config.fs_port
				},

				// Обработчик успешного подключения //
				function() {
					fn.printf( 'debug', 'Successfully connected to file server' );
					fn.printf( 'debug', 'Downloading handshake...' );

					// Запрос handshake //
					connection.writeJSON({
						'get'    : 'handshake',
						'format' : self.tool.format
					});
				}
			);

			// Обработчик ошибки соединения //
			connection.on( 'error',
				function() {
					fn.printf( 'error', 'Cannot connect to file server' );
					reject();
				}
			);

			// Обработчик поступающих данных //
			connection.on( 'data',
				function( data ) {
					fs.open(
						'tmp/handshake',
						'w',

						function( error, file ) {
							if ( error ) {
								fn.printf( 'error', 'Handshake downloading error: cannot write file' );
								reject();
								return;
							}

							// Запись буфера в файл //
							fs.write( file,	data, 0, data.length,
								function( error ) {
									if ( error ) {
										fn.printf( 'error', 'Handshake downloading error: cannot write file' );
										reject();
										return;			
									} else {
										fn.printf( 'log', 'Handshake successfully downloaded!' );
										resolve();
									}
								}
							);
						}
					);
				}
			);
		}
	);
};

/**
 * Подключает узел к серверу
 */
slave.prototype.connect = function() {
	var self        = this;
	var master_ip   = this.config.ip;
	var master_port = this.config.main_port;

	return new Promise(
		function( resolve, reject ) {
			var connection = net.connect( { 'host': master_ip, 'port': master_port }, function(){
				resolve();
				fn.printf( 'log', 'Successfully connected to %s!', master_ip );
			});

			self.connection = connection;

			// Обработчик ошибки подключения //
			connection.on( 'error', function(){
				reject();
				fn.printf( 'error', 'Cannot connect to %s:%s', master_ip, master_port );
			});

			// Обработчик поступающих от сервера данных //
			connection.on( 'data', function( data ){
				var response = data.toString().trim();
				var header   = null;

				// Данные, которые не удалось распарсить, не обрабатываются //
				try {
					// Парсинг JSON //
					response = JSON.parse( response );
					header   = response.header;
				} catch ( e ) {
					fn.printf( 'warn', 'Cannot parse message from server' );
					return;
				}

				// Вызвать обработчик соответствующей команды //
				if ( header in protocol ) {
					protocol[ header ]( self, response, connection );
				}
			});

			// Обработчик разрыва соединения //
			connection.on( 'end', function(){
				fn.printf( 'warn', 'Disconnected from server' );
			});
		}
	);
};

module.exports = slave;