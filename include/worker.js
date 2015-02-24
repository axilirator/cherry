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
var protocol = require( './master_protocol.js' );

// Обработчик сигнала SIGINT //
process.on('SIGINT', function () {
	console.warn( '\n\n  Got a SIGINT. Disconnecting...\n' );
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

function main( argv ) {
	this.master_ip      = null;  // IP-адрес master-node
	this.cracking_tools = null;  // Ссылка на родительский объект инструментов
	this.cracking_tool  = null;  // Ссылка на интерфейс используемого инструмента
	this.connected      = false; // Статус подключения

	// Конфигурация узла //
	this.config = fn.init_cfg( fs, argv, 'config/worker.conf' );
}

/**
 * Проверяет правильность конфигурации.
 */
main.prototype.check_cfg = function() {
	var worker = this;

	return new Promise(
		function( resolve, reject ) {
			var ip_regexp = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

			fn.printf( 'log', 'Checking configuration...' );

			// Если возникли ошибки при инициализации //
			if ( worker.config === false ) {
				reject();
			}

			// Если не определен адрес сервера //
			if ( worker.config.master_ip === undefined ) {
				fn.printf( 'warn', 'You must specify IP address of master-node' );
				reject();
			}

			// Если IP имеет некорректный формат //
			if ( !ip_regexp.test( worker.config.master_ip ) ) {
				fn.printf( 'warn', "Incorrect master-node's IP '%s'!", worker.config.master_ip );
				reject();
			}

			// Все ok! //
			resolve();
		}
	);
};

/**
 * Выполняет поиск и выбор инструмента для атаки.
 */
main.prototype.find_tool = function() {
	var worker = this;

	return new Promise(
		function( resolve, reject ) {
			var drivers = require( './drivers.js' );
			fn.printf( 'log', 'Searching for cracking tools...' );

			// Запуск поиска инструмента перебора паролей //
			drivers.search().then(
				function( tool ) {
					// Инструмент найден //
					fn.printf( 'log', 'Using %s as cracking tool', tool.name );

					// Создаем ссылки в объекте кластера //
					worker.drivers = drivers;
					worker.tool    = tool;

					resolve();
				},

				function( error ) {
					// Скорее всего, ничего не нашлось... //
					fn.printf( 'error', 'Cannot find cracking tool!' );
					reject();
				}
			);
		}
	);
};

/**
 * Подключает узел к серверу
 */
main.prototype.connect = function() {
	fn.printf( 'log', 'Connecting to %s...', this.config.master_ip );

	var worker      = this;
	var master_ip   = this.config.master_ip;
	var master_port = this.config.master_port;

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

module.exports = main;