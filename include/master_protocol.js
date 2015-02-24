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

// Обработчики команд, поступающих от сервера //
module.exports = {
	'connect' : function( self, params, connection ) {
		switch ( params.status ) {
			// Подключение не удалось //
			case 'rejected':
				// Не удалось подключиться к кластеру //
				var msg = 'Connection rejected!';

				switch ( params.reason ) {
					// Превышено максимальное количество узлов //
					case 'max-nodes-count':
						msg += ' Workers count limited';
					break;

					// Динамическая синхронизация отключена //
					case 'dsync-disabled':
						msg += ' Dynamic joining disabled on this master-node';
					break;
				}

				fn.printf( 'warn', msg );
			break;
			
			// Подключение прошло успешно //
			case 'connected':
				// Если асинхронные узлы запрещены //
				if ( !params.async_allowed && self.config.worker_async ) {
					fn.printf( 'warn', 'Async-nodes is not allowed' );
					connection.end();
					return;
				}

				// Подготовка запроса //
				var join_request = { 'header' : 'join' };

				// Если сервер требует предоставить пароль //
				if ( params.secure ) {
					fn.printf( 'log', 'Master-node requires secure authentication' );

					if ( self.config.master_secret !== false ) {
						// Если пароль задан //
						var md5sum = crypto.createHash( 'md5' );
						md5sum.update( params.salt.toString() );
						md5sum.update( self.config.master_secret.toString() );

						join_request.secret = md5sum.digest( 'hex' );
					} else {
						fn.printf( 'error', 'You must specify master_secret for authentication!' );
						connection.end();
						return;
					}
				}

				// Запуск теста производительности //
				fn.printf( 'log', 'Running benchmark...' );
				join_request[ 'speed' ] = self.tool.benchmark();
				join_request[ 'async' ] = self.config.worker_async;

				connection.writeJSON( join_request );
			break;
		}
	},

	'join' : function( self, params ) {
		if ( params.status === 'joined' ) {
			// Узел зарегистрирован в кластере //
			fn.printf( 'log', 'Successfully joined the cluster' );
		} else {
			var msg = 'Cannot join the cluster:';

			switch ( params.reason ) {
				case 'bad-secret':
					msg += ' incorrect password';
				break;

				case 'async-disallowed':
					msg += ' async-nodes is not allowed';
				break;
			}

			fn.printf( 'warn', msg );
		}
	},

	'message' : function( self, params ) {
		fn.printf( params.type, params.body );
	},

	'kill' : function( self ) {
		
	}
};