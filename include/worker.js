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

function worker( argv ) {
	this.master_ip		= null;		// IP-адрес master-node
	this.cracking_tools = null;		// Ссылка на родительский объект инструментов
	this.cracking_tool  = null;		// Ссылка на интерфейс используемого инструмента
	this.connected		= false;	// Статус подключения

	// Конфигурация узла //
	this.config			= fn.init_cfg( fs, argv, './worker.conf' );
}

/**
 * Проверяет правильность конфигурации.
 */
worker.prototype.check_cfg = function() {
	var ip_regexp = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

	if ( this.config.master_ip === undefined ) {
		fn.printf( 'warn', 'You must specify IP address of master-node\n' );
		return false;
	}

	if ( !ip_regexp.test( this.config.master_ip ) ) {
		fn.printf( 'warn', 'Incorrect master-node\'s IP \'%s\'!\n', this.config.master_ip );
		return false;
	}

	return true;
};

/**
 * Выполняет поиск и выбор инструмента для атаки.
 */
worker.prototype.find_tool = function() {
	fn.printf( 'log', 'Searching for cracking tools...' );

	var cracking_tools = require( './tools.js' );
	var cracking_tool  = cracking_tools.find_tool( this.config.tool );

	if ( cracking_tool ) {
		// Инструмент найден //
		fn.printf( 'log', 'Using %s as cracking tool', cracking_tool.name );

		this.cracking_tools = cracking_tools;
		this.cracking_tool  = cracking_tool;

		return true;
	} else {
		fn.printf( 'error', 'Cannot find cracking tool!\n' );
		return false;
	}
};

/**
 * Подключает узел к серверу
 */
worker.prototype.connect = function() {
	fn.printf( 'log', 'Connecting to %s...', this.config.master_ip );

	var worker      = this;
	var master_ip   = this.config.master_ip;
	var master_port = this.config.master_port;

	var connection = net.connect( { 'host': master_ip, 'port': master_port }, function(){
		fn.printf( 'log', 'Sucessefully connected to %s, now joining...', master_ip );
	});

	connection.on( 'error', function(){
		fn.printf( 'error', 'Cannot connect to %s:%s\n', master_ip, master_port );
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
		fn.printf( 'warn', 'Disconnected from master-node\n' );
	});
};

module.exports = worker;