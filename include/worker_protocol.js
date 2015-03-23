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

var crypto = require( 'crypto' );
var fn     = require( './fn.js' );
var fs     = require( 'fs' );

var all = {
	// Обработчик регистрации узла в кластере //
	'join': function( node, params, cluster ) {
		cluster.join( node, params );
	},

	// Команда отсоединения от кластера //
	'leave': function( node, params ) {
		node.socket.destroy();
	}
};

var joined = {
	'get' : function( node, params, cluster ) {
		switch ( params.target ) {
			// Запрос на получение файла handshake //
			case "handshake":
				cluster.send_handshake( node.socket, params.format );
		}
	},

	// Маяки от worker-node //
	'echo' : function( node, params, cluster ) {
		var new_speed = parseInt( params.speed ) || 0;

		if ( node.status !== 'ready' && new_speed > 0 ) {
			node.status = 'ready';
		}

		// Обновление данных о скорости //
		cluster.total_speed = cluster.total_speed - node.speed + new_speed;
		node.speed          = new_speed;

		// Ответ узлу //
		node.socket.writeJSON({
			'header'     : 'echo',
			'total_speed': cluster.total_speed
		});
	},

	// Сигнал о событии //
	'event': function( node, params, cluster ) {
		switch ( params.event ) {
			case 'key_found':
				fn.printf( 'log', 'Password found \"%s\"!', params.password );
			break;
		}
	}
};

module.exports = {
	'all'    : all,
	'joined' : joined
};