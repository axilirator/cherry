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
				}

				fn.printf( 'warn', msg );
			break;
			
			// Подключение прошло успешно //
			case 'connected':
				// Вывод информации о сервере //
				fn.printf( 'log', 'Server version: %s', params.version_txt );

				// Если асинхронные узлы запрещены //
				if ( !params.async_allowed && self.config.async ) {
					fn.printf( 'warn', 'Asynchronous nodes are not allowed' );
					connection.end();
					return;
				}

				// Продолжаем цепочку действий узла //
				self.chain.storage.master_params = params;
				self.chain.next();
			break;
		}
	},

	'join' : function( self, params ) {
		if ( params.status === 'joined' ) {
			// Узел зарегистрирован в кластере //
			fn.printf( 'log', 'Successfully joined the cluster' );

			// Продолжаем цепочку действий узла //
			self.chain.next();
		} else {
			var msg = 'Cannot join the cluster:';

			switch ( params.reason ) {
				case 'bad-secret':
					msg += ' incorrect password';
					break;

				case 'async-disallowed':
					msg += ' async-nodes is not allowed';
					break;

				case 'version':
					msg += ' the server\'s version differ from your';
					break;

				case 'dictionary-checksum':
					msg += ' checksums of dictionaries does not match';
					break;
			}

			fn.printf( 'warn', msg );
		}
	},

	'message' : function( self, params ) {
		fn.printf( params.type, '(master) ' + params.body );
	}
};