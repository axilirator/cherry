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

var fs       = require( 'fs' );
var net      = require( 'net' );
var path     = require( 'path' );
var crypto   = require( 'crypto' );

var fn       = require( './fn.js' );
var chain    = require( './chains.js' );
var protocol = require( './worker_protocol.js' );

var CONFIG   = 'config/master.conf';

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
 * Основная исполняемая функция модуля.
 *
 * @constructor
 * @param {object} argv Массив параметров командной строки
 */
function master( argv ) {
	this.nodes       = [];   // Массив подключенных узлов
	this.config      = {};   // Конфигурация кастера
	this.dictionary  = null; // Интерфейс словаря
	this.capturefile = null; // Интерфейс файла handshake
	this.nodes_count = 0;    // Количество подключенных узлов
	this.total_speed = 0;    // Суммарная скорость кластера
	this.argv        = argv; // Параметры командной строки
}

/**
 * Стартер класса.
 */
master.prototype.bootstrap = function() {
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
			if ( self.check_config() ) chain.next();
		},

		// Асинхронная загрузка словаря и файла handshake //
		function( chain ) {
			fn.printf( 'debug', 'Loading dictionary driver...' );
			self.dictionary  = new fn.file( self.config.dictionary );

			fn.printf( 'debug', 'Reading capturefile...' );
			self.capturefile = new fn.file( self.config.capturefile );

			chain.next();
		},

		// Проверка существования и получение размеров файлов //
		function( chain ) {
			Promise.all([
				self.dictionary.info(),
				self.capturefile.info()
			]).then( chain.next ).catch(
				function( e ) {
					if ( e.error === 'NaF' ) {
						fn.printf( 'error', "'%s' is not a file", e.path );
					} else {
						fn.printf( 'error', "Cannot read file '%s'", e.path );
					}
				}
			);
		},

		// Рассчет контрольных сумм //
		function( chain ) {
			Promise.all([
				self.dictionary.calculate_checksum(),
				self.capturefile.calculate_checksum()			
			]).then( chain.next ).catch(
				function( e ) {
					fn.printf( 'error', "Cannot calculate checksum for '%s'! Have you the crc32 utility?" );
				}
			);
		},

		// Запуск файлового сервера //
		function( chain ) {
			fn.printf( 'debug', 'Starting file server...' );

			self.file_server().then( chain.next );
		},

		// Запуск основного сервера //
		function( chain ) {
			fn.printf( 'debug', 'Bootstraping finished, starting main server...' );

			self.main_server().then( chain.next );
		},

		// Запуск мониторинга скорости //
		function( chain ) {
			setInterval( self.performance.bind( self ), 600 );
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
};

/**
 * Выполняет проверку конфигурации.
 * @return {boolean} Результат поверки
 */
master.prototype.check_config = function() {
	var config = this.config;
	var result = true;

	// Проверка основного порта //
	if ( config.main_port > 0 && config.main_port <= 49151 ) {
		if ( config.main_port < 1024 ) {
			fn.printf( 'warn', 'It is recommended to use main_port number from 1024 to 49151' );
		}
	} else {
		fn.printf( 'error', "Incorrect main_port number '%s'", config.main_port );
		result = false;
	}

	// Проверка порта файлового сервера //
	if ( config.fs_port > 0 && config.fs_port <= 49151 ) {
		if ( config.fs_port < 1024 ) {
			fn.printf( 'warn', 'It is recommended to use fs_port number from 1024 to 49151' );
		}
	} else {
		fn.printf( 'error', "Incorrect fs_port number '%s'", config.fs_port );
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
		if ( config.secret === false ) {
			fn.printf( 'debug', 'Using default authentication' );
		} else {
			fn.printf( 'error', 'Incorrect secret format. Use string or false' );
			result = false;
		}
	}

	// Проверка ограничения количества узлов //
	if ( config.max_clients > 0 ) {
		fn.printf( 'debug', 'Count of nodes is limited to %s', config.max_clients );
	} else {
		if ( config.max_clients === false ) {
			fn.printf( 'debug', 'Count of nodes is unlimited' );
		} else {
			fn.printf( 'error', 'Incorrect max_clients format' );
			result = false;
		}
	}

	// Проверка ограничения асинхронных узлов //
	if ( typeof config.async_allowed === 'boolean' ) {
		fn.printf( 'debug',
			config.async_allowed ? 'Asynchronous nodes are allowed' : 'Asynchronous nodes are forbidden'
		);
	} else {
		fn.printf( 'error', 'Incorrect async_allowed value. It can be only boolean' );
		result = false;
	}

	// Проверка пути словаря //
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

	// Проверка пути handshake //
	if ( typeof config.capturefile === 'string' && config.capturefile.length > 0 ) {
		fn.printf( 'debug', "Capturefile path: '%s'", config.capturefile );
	} else {
		if ( config.capturefile === false ) {
			fn.printf( 'error', 'Capturefile path is not set' );
		} else {
			fn.printf( 'error', 'Incorrect capturefile path' );
		}

		result = false;
	}

	return result;
};

/**
 * Отправляет узлам широковещательное сообщение.
 * 
 * @param {string} header Заголовок сообщения
 * @param {object} data   Данные сообщения
 * @param {string} type   Фильтр узлов: all/sync/async
 */
master.prototype.broadcast = function( header, data, type ) {
	var node = null;

	for ( var i = 0; i < this.nodes_count; i++ ) {
		node = this.nodes[ i ];

		if ( type === 'sync' ) {
			if ( !node.sync )
				continue;
		} else if ( type === 'async' ) {
			if ( node.sync )
				continue;
		}

		node.socket.write( fn.msg( header, data ) );
	}
};

/**
 * Отображает карту кластера и данные о скорости узлов.
 */
master.prototype.performance = function() {
	process.stdout.write( "      Total speed: " + this.total_speed + " PMKs/s\r" );
};

/**
 * Метод регистрации узла в кластере.
 * @param  {object} node   Ссылка на объект узла
 * @param  {object} params Параметры, переданные узлом
 */
master.prototype.join = function( node, params ) {
	var cluster = this;

	// Проверка версии узла //
	if ( params.version_num < global.NUM_VER ) {
		fn.printf( 'log', 'New connection rejected: version conflict' );

		node.socket.writeJSON({
			'header' : 'join',
			'status' : 'rejected',
			'reason' : 'version'
		});

		node.socket.destroy();
		return;
	}

	// Если запрещено подключение асинхронных узлов //
	if ( !cluster.config.async_allowed && params.async ) {
		fn.printf( 'log', 'New connection rejected: asynchronous nodes are not allowed' );

		node.socket.writeJSON({
			'header' : 'join',
			'status' : 'rejected',
			'reason' : 'async-disallowed'
		});

		node.socket.destroy();
		return;
	}

	// Если необходима аутентификация //
	if ( cluster.config.secret ) {
		var md5sum = crypto.createHash( 'md5' );
		md5sum.update( node.salt.toString() );
		md5sum.update( cluster.config.secret );

		// Если пароль не верный, отклонить запрос //
		if ( md5sum.digest( 'hex' ) !== params.secret ) {
			fn.printf( 'warn', 'New connection rejected: bad secret' );

			// Соединение разрывается через 5 секунд для защиты от перебора //
			setTimeout(function(){
				// Если узел еще не отключился //
				if ( !node.socket.destroyed ) {
					node.socket.writeJSON({
						'header' : 'join',
						'status' : 'rejected',
						'reason' : 'bad-secret'
					});

					node.socket.destroy();
				}
			}, 5000 );

			return;
		}
	}

	// Проверка контрольной суммы словаря //
	if ( !params.async ) {
		if (
			params.dictionary_size     !== cluster.dictionary.size ||
			params.dictionary_checksum !== cluster.dictionary.checksum
		) {
			fn.printf( 'log', 'New connection rejected: dictionary checksum error' );

			node.socket.writeJSON({
				'header' : 'join',
				'status' : 'rejected',
				'reason' : 'dictionary-checksum'
			});

			node.socket.destroy();
			return;
		}
	}

	// Проверка значения скорости //
	if ( params.speed < 100 || params.speed > 1000000 ) {
		// Неверное значение скорости //
		fn.printf( 'log', 'New connection rejected: incorrect speed value' );

		node.socket.writeJSON({
			'header' : 'join',
			'status' : 'rejected',
			'reason' : 'wrong-speed'
		});

		node.socket.destroy();
		return;
	}

	// Все проверки прошли успешно //
	// Инициализация параметров узла //
	node.joined = true;
	node.uid    = cluster.nodes_count++;
	node.async  = params.async;
	node.speed  = params.speed;

	// Регистрация узла //
	cluster.nodes.push( node );

	// Обновление данных о скорости //
	cluster.total_speed += node.speed;

	// Уведомление узла об успешной регистрации //
	node.socket.writeJSON(
		{
			'header' : 'join',
			'status' : 'joined' 
		},

		{
			'header' : 'message',
			'type'   : 'log',
			'body'   : 'Welcome to the cluster!'
		}
	);

	fn.printf( 'log', 'Node %s has joined the cluster', node.ip );
};

/**
 * Обработчик подключений новых узлов.
 */
master.prototype.connection_acceptor = function( socket ) {
	var cluster = this;

	// Обработка ограничения максимального количества узлов //
	if ( cluster.config.max_clients > 0 ) {
		if ( cluster.nodes_count === cluster.config.max_clients ) {
			// Подключено максимальное количество узлов //
			fn.printf( 'warn', 'New connection rejected: maximum nodes count' );

			socket.writeJSON({
				'header' : 'connect',
				'status' : 'rejected',
				'reason' : 'max-nodes-count'
			});

			socket.destroy();
			return;
		}
	}

	fn.printf( 'log', "Processing new connection from %s", socket.remoteAddress );

	// Подготовка регистрационных данных узла //
	var node = {
		'ip'     : socket.remoteAddress,
		'salt'   : fn.random( 1000000000 ),
		'socket' : socket,
		'joined' : false
	};

	// Отправка сообщения об успешном соединении //
	socket.writeJSON({ 
		'header'        : 'connect',
		'status'        : 'connected',
		'version_txt'   : global.TXT_VER,
		'version_num'   : global.NUM_VER,
		'async_allowed' : cluster.config.async_allowed,
		'secure'        : cluster.config.secret ? true : false,
		'salt'          : node.salt
	});

	// Обработчик поступающих сообщений //
	socket.on( 'data', function( data ){
		var response = data.toString().trim();
		var source   = node.joined ? protocol.joined : protocol.all;
		var header   = null;

		// Данные, которые не удалось распарсить, не обрабатываются //
		try {
			response = JSON.parse( response );
			header   = response.header;
		} catch ( e ) {
			fn.printf( 'debug', 'Cannot parse message from %s', socket.remoteAddress );
			return;
		}

		// Вызвать обработчик соответствующей команды //
		if ( header in source ) {
			source[ header ]( node, response, cluster );
		}
	});

	// Обработчик отключения  //
	socket.on( 'close', function(){
		// Если узел уже зарегистрирован //
		if ( node.joined ) {
			for ( var i = 0; i < cluster.nodes_count; i++ ) {
				if ( cluster.nodes[ i ].uid === node.uid ) {
					cluster.nodes.splice( i, 1 );
					break;
				}
			}

			cluster.nodes_count--;
			cluster.total_speed -= node.speed;
		}

		fn.printf( 'log', 'Node %s disconnected', node.ip );
	});
};

master.prototype.main_server = function() {
	var cluster = this;

	return new Promise(
		function( resolve, reject ) {
			var handler = cluster.connection_acceptor.bind( cluster );
			var server  = net.createServer( handler );
			var port    = cluster.config.main_port;
			
			server.once( 'error',
				function( error ) {
					if ( error.code === 'EADDRINUSE' ) {
						fn.printf( 'error', 'Cannot start main server: port %s is busy', port );
					} else {
						fn.printf( 'error', 'Cannot start main server: you have no permissions to listen port %s', port );
					}

					reject();
				}
			).once( 'listening', function(){
				fn.printf( 'log', 'Listening on %s port...', port );
				resolve();
			});

			server.listen( port );
		}
	);
};

master.prototype.file_server = function() {
	var cluster = this;
	var options = {
		'flags'     : 'r',
		'encoding'  : null,
		'autoClose' : true
	};

	// Обработчик новых соединений //
	var handler = function( socket ) {
		// Обработчик поступающих сообщений //
		socket.on( 'data',
			function( data ){
				var response = data.toString().trim();

				// Обработка запроса //
				try {
					response = JSON.parse( response );
				} catch ( e ) {
					fn.printf( 'debug', 'Cannot parse request from %s', socket.remoteAddress );
					return;
				}

				switch ( response.get ) {
					// Запрос handshake //
					case 'handshake':
						options.encoding = null;
						var stream       = fs.createReadStream( cluster.config.capturefile, options );

						stream.on( 'open',
							function() {
								stream.pipe( socket );
								fn.printf( 'log', 'Handshake sent to %s', socket.remoteAddress );
							}
						);

						break;

					case 'dictionary':
						break;
				}
			}
		);
	};

	return new Promise(
		function( resolve, reject ) {
			var server = net.createServer( handler.bind( cluster ) );
			var port   = cluster.config.fs_port;

			server.once( 'error',
				function( error ) {
					if ( error.code === 'EADDRINUSE' ) {
						fn.printf( 'error', 'Cannot start file server: port %s is busy', port );
					} else {
						fn.printf( 'error', 'Cannot start file server: you have no permissions to listen port %s', port );
					}

					reject();
				}
			).once( 'listening',
				function(){
					fn.printf( 'debug', 'File server successfully started' );
					resolve();
				}
			);

			server.listen( port );
		}
	);
};

module.exports = master;