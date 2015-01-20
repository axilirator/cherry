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

var fs  = require( 'fs' );
var net = require( 'net' );

var fn       = require( './fn.js' );
var protocol = require( './worker_protocol.js' );

// Обработчик сигнала SIGINT //
process.on('SIGINT', function () {
	console.log( '\n\n  Got a SIGINT. Disconnecting all nodes...\n' );
	process.exit( 0 );
});

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
function main( argv ) {
	this.workers       = [];		// Массив подключенных узлов
	this.status        = 'waiting';	// Статус кластера waiting/processing
	this.workers_count = 0;			// Количество подключенных узлов
	this.total_speed   = 0;			// Суммарная скорость кластера

	// Конфигурация кластера //
	this.config        = fn.init_cfg( fs, argv, './master.conf' );
}

/**
 * Отправляет узлам широковещательное сообщение.
 * 
 * @param {string} header Заголовок сообщения
 * @param {object} data   Данные сообщения
 * @param {string} type   Фильтр узлов: all/sync/async
 */
main.prototype.broadcast = function( header, data, type ) {
	var node = null;

	for ( var i = 0; i < this.workers_count; i++ ) {
		node = this.workers[ i ];

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
main.prototype.performance = function() {
	process.stdout.write( "      Total speed: " + this.total_speed + " PMK/s\r" );
	return;

	/*if ( !workers_count )
		return;

	var sync_count  = 0;
	var async_count = 0;

	console.log( '  [+] Cluster map:' );

	// Отображение синхронизированных узлов //
	for ( var i = 0; i < workers_count; i++ ) {
		if ( workers[ i ].sync ) {
			if ( sync_count === 0 ) {
				console.log( '      Sync nodes:' );
			}

			console.log( '        #%s %s: %s PMK/s', ++sync_count, workers[ i ].ip, workers[ i ].speed );
		}
	}
	
	// Отображение асинхронных узлов //
	for ( var i = 0; i < workers_count; i++ ) {
		if ( !workers[ i ].sync ) {
			if ( async_count === 0 ) {
				console.log( '      Async nodes:' );
			}

			console.log( '        #%s %s: %s PMK/s', ++async_count, workers[ i ].ip, workers[ i ].speed );
		}
	}

	console.log( "\n      Total speed: %s PMK/s", cluster.total_speed );*/
};

/**
 * Проверяет правильность конфигурации.
 */
main.prototype.check_cfg = function() {
	var config      = this.config;
	var dictionary  = fs.existsSync( config.dictionary )  && fs.lstatSync( config.dictionary ).isFile();
	var capturefile = fs.existsSync( config.capturefile ) && fs.lstatSync( config.capturefile ).isFile();

	if ( dictionary && capturefile ) {
		return true;
	} else {
		fn.printf( 'error', 'Error opening capturefile and/or dictionary' );
		fn.printf( 'error', 'Please specify correct capturefile (-r) and dictionary (-d)\n' );

		return false;
	}
};

/**
 * Обработчик подключений новых узлов.
 */
main.prototype.accept_connection = function( socket ) {
	// Обработка ограничения максимального количества узлов //
	if ( cluster.master_max_clients > 0 ) {
		if ( cluster.workers_count === cluster.config.master_max_clients ) {
			// Подключено максимальное количество узлов //
			fn.printf( 'warn', 'New connection rejected: max worker-nodes count' );

			socket.writeJSON({
				'header' : 'connect',
				'status' : 'rejected',
				'reason' : 'max-nodes-count'
			});

			socket.destroy();
			return;
		}
	}

	// Обработка ограничения на динамическое подключение узла //
	if ( cluster.status === 'processing' && !cluster.config.sync_dynamic ) {
		fn.printf( 'warn', 'New connection rejected: dynamic synchronization is disabled' );

		socket.writeJSON({
			'header' : 'connect',
			'status' : 'rejected',
			'reason' : 'dsync-disabled'
		});

		socket.destroy();
		return;
	}

	fn.printf( 'log', "Processing new connection from %s", socket.remoteAddress );

	var worker = {
		'ip'     	: socket.remoteAddress,
		'salt'      : fn.random( 1000000000 ),
		'socket' 	: socket,
		'connected' : false,
		'sync'      : true,
		'speed'  	: 0,
		'uid'     	: null
	};

	// Отправка сообщения об успешном соединении //
	socket.writeJSON({ 
		'header' : 'connect',
		'status' : 'connected',
		'secure' : cluster.config.master_secret ? true : false,
		'salt'   : worker.salt
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
			fn.printf( 'debug', 'Can not parse request from %s', socket.remoteAddress );

			socket.writeJSON({
				'header' : 'error',
				'error'  : 'parsing_error'
			});
		}

		// Вызвать обработчик соответствующей команды //
		if ( header in protocol ) {
			protocol[ header ]( worker, response, cluster, socket );
		}
	});

	// Обработчик отключения  //
	socket.on( 'close', function(){
		// Если worker уже зарегистрирован //
		if ( worker[ 'uid' ] !== null ) {
			var uid = worker[ 'uid' ];
			var len = cluster.workers_count;

			for ( var i = 0; i < len; i++ ) {
				if ( cluster.workers[ i ].uid === uid ) {
					cluster.workers.splice( i, 1 );
					break;
				}
			}

			cluster.workers_count--;
			cluster.total_speed -= worker.speed;
		}

		fn.printf( 'log', 'Client %s disconnected', worker.ip );

		// Освобождение памяти //
		worker = null;
	});
};

main.prototype.start_server = function() {
	var cluster     = this;
	var server      = net.createServer( this.accept_connection );
	var master_port = cluster.config.master_port;
	
	server.once( 'error', function( err ) {
		if ( err.code === 'EADDRINUSE' ) {
			fn.printf( 'error', 'Cannot start server: port %s is busy\n', master_port );
		} else {
			fn.printf( 'error', 'Cannot start server: you have no permissions to listen port %s\n', master_port );
		}
	}).once( 'listening', function(){
		fn.printf( 'log', 'Listening on %s port...', master_port );

		// Запуск мониторинга нагрузки //
		setInterval( cluster.performance.bind( cluster ), 500 );
	});

	server.listen( master_port );
}

module.exports = main;