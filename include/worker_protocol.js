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

// Обработчики команд, поступающих от узлов //
module.exports = {
	// Обработчик регистрации узла в кластере //
	'join': function( node, params, cluster ) {
		// Если узел еще не подключен //
		if ( !node[ 'connected' ] ) {
			// Если запрещено подключение асинхронных узлов //
			if ( !cluster.config.async_allowed && params.async ) {
				fn.printf( 'log', 'New connection rejected: async-nodes is not allowed' );

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

			// Инициализация параметров узла //
			node[ 'uid' ]       = cluster.nodes_count++;
			node[ 'async' ]     = params.async;
			node[ 'speed' ]     = params.speed || 0;
			node[ 'connected' ] = true;

			// Регистрация узла //
			cluster.nodes.push( node );

			// Обновление данных о скорости //
			cluster.total_speed += node[ 'speed' ];

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
		}
	},

	// Маяки от worker-node //
	'echo': function( node, params, cluster ) {
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
	},

	// Команда отсоединения от кластера //
	'leave': function( node, params, cluster ) {
		node.socket.destroy();
	}
};