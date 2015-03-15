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
	this.nodes_count = 0;    // Количество подключенных узлов
	this.total_speed = 0;    // Суммарная скорость кластера
	this.config      = {};   // Конфигурация кастера
	this.argv        = argv; // Параметры командной строки
}

/**
 * Стартер класса.
 */
master.prototype.bootstrap = function() {
	var self = this;
	var main = new chain([
		function( chain ) {
			fn.printf( 'debug', 'Bootstraping...' );
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
			self.check_config( self.config ) && chain.next();
		},

		// Загрузка драйвера словаря //
		function( chain ) {
			fn.printf( 'debug', 'Loading dictionary driver...' );
			
			var driver      = require( './dictionary.js' );
			self.dictionary = new driver( self.config.dictionary );

			// Как только драйвер обработает словарь, идем дальше //
			self.dictionary.bootstrap().then( chain.next );
		},

		// Обработка handshake //
		function( chain ) {
			fs.stat( self.config.capturefile,
				function( error, stats ) {
					if ( error ) {
						fn.printf( 'error', "Cannot open capturefile '%s'!", self.config.capturefile );
					} else {
						// Если путь ссылается на существующий файл //
						if ( stats.isFile() ) {
							chain.next();
						} else {
							fn.printf( 'error', "'%s' is not a file!", self.config.capturefile );
						}
					}
				}
			);
		},

		// Запуск сервера //
		function( chain ) {
			fn.printf( 'debug', 'Bootstraping finished, starting server...' );
			self.start_server();

			chain.next();
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

master.prototype.check_config = function( config ) {
	var result = true;

	// Проверка порта //
	if ( config.port > 0 && config.port <= 49151 ) {
		if ( config.port < 1024 ) {
			fn.printf( 'warn', 'It is recommended to use port number from 1024 to 49151' );
		}
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
	process.stdout.write( "      Total speed: " + this.total_speed + " PMK/s\r" );
	return;

	/*if ( !nodes_count )
		return;

	var sync_count  = 0;
	var async_count = 0;

	console.log( '  [+] Cluster map:' );

	// Отображение синхронизированных узлов //
	for ( var i = 0; i < nodes_count; i++ ) {
		if ( nodes[ i ].sync ) {
			if ( sync_count === 0 ) {
				console.log( '      Sync nodes:' );
			}

			console.log( '        #%s %s: %s PMK/s', ++sync_count, nodes[ i ].ip, nodes[ i ].speed );
		}
	}
	
	// Отображение асинхронных узлов //
	for ( var i = 0; i < nodes_count; i++ ) {
		if ( !nodes[ i ].sync ) {
			if ( async_count === 0 ) {
				console.log( '      Async nodes:' );
			}

			console.log( '        #%s %s: %s PMK/s', ++async_count, nodes[ i ].ip, nodes[ i ].speed );
		}
	}

	console.log( "\n      Total speed: %s PMK/s", cluster.total_speed );*/
};

/**
 * Обработчик подключений новых узлов.
 */
master.prototype.connection_acceptor = function( socket ) {
	var cluster = this;

	// Обработка ограничения максимального количества узлов //
	if ( cluster.max_clients > 0 ) {
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
	var worker = {
		'ip'     : socket.remoteAddress,
		'salt'   : fn.random( 1000000000 ),
		'socket' : socket,
		'joined' : false,
		'async'  : false,
		'speed'  : 0,
		'uid'    : null
	};

	// Отправка сообщения об успешном соединении //
	socket.writeJSON({ 
		'header'        : 'connect',
		'status'        : 'connected',
		'async_allowed' : cluster.config.async_allowed,
		'secure'        : cluster.config.secret ? true : false,
		'salt'          : worker.salt
	});

	// Обработчик поступающих сообщений //
	socket.on( 'data', function( data ){
		var response = data.toString().trim();
		var header   = null;

		// Данные, которые не удалось распарсить, не обрабатываются //
		try {
			response = JSON.parse( response );
			header   = response.header;
		} catch ( e ) {
			fn.printf( 'debug', 'Cannot parse request from %s', socket.remoteAddress );
		}

		// Вызвать обработчик соответствующей команды //
		if ( header in protocol ) {
			protocol[ header ]( worker, response, cluster, socket );
		}
	});

	// Обработчик отключения  //
	socket.on( 'close', function(){
		// Если worker уже зарегистрирован //
		if ( worker.uid !== null ) {
			var uid = worker.uid;
			var len = cluster.nodes_count;

			for ( var i = 0; i < len; i++ ) {
				if ( cluster.nodes[ i ].uid === uid ) {
					cluster.nodes.splice( i, 1 );
					break;
				}
			}

			cluster.nodes_count--;
			cluster.total_speed -= worker.speed;
		}

		fn.printf( 'log', 'Client %s disconnected', worker.ip );
	});
};

master.prototype.start_server = function() {
	var cluster = this;
	var handler = cluster.connection_acceptor.bind( cluster );
	var server  = net.createServer( handler );
	var port    = cluster.config.port;
	
	server.once( 'error', function( err ) {
		if ( err.code === 'EADDRINUSE' ) {
			fn.printf( 'error', 'Cannot start server: port %s is busy', port );
		} else {
			fn.printf( 'error', 'Cannot start server: you have no permissions to listen port %s', port );
		}
	}).once( 'listening', function(){
		fn.printf( 'log', 'Listening on %s port...', port );

		// Запуск мониторинга нагрузки //
		setInterval( cluster.performance.bind( cluster ), 500 );
	});

	server.listen( port );
};

module.exports = master;