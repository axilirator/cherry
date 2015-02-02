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

// Обработчики команд, поступающих от master-node //
module.exports = {
	'connect': function( self, params, connection ) {
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

					case 'bad-secret':
						msg += ' Incorrect master secret';
					break;
				}

				fn.printf( 'warn', msg + '\n' );
			break;
			
			// Подключение прошло успешно //
			case 'connected':
				var join_request = { 'header' : 'join' };

				if ( params.secure ) {
					fn.printf( 'log', 'Master-node requires secure authentication' );

					if ( self.config.master_secret !== false ) {
						// Если пароль задан //
						var md5sum = crypto.createHash( 'md5' );
						md5sum.update( params.salt.toString() );
						md5sum.update( self.config.master_secret.toString() );

						join_request.secret = md5sum.digest( 'hex' );
					} else {
						fn.printf( 'error', 'You must specify master_secret for authentication!\n' );
						connection.end();
					}
				}

				// Запуск теста производительности //
				fn.printf( 'log', 'Running benchmark...' );
				join_request[ 'speed' ] = self.cracking_tool.benchmark();
				join_request[ 'async' ] = self.config.worker_async;

				connection.writeJSON( join_request );
			break;

			// Узел зарегистрирован в кластере //
			case 'joined':
				fn.printf( 'log', 'Successfully joined the cluster' );
			break;
		}
	},

	'message': function( self, params ) {
		fn.printf( params.type, params.body );
	},

	'kill': function( self ) {
		
	}
};