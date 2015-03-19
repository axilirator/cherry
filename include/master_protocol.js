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

				// Подготовка запроса //
				var join_request = {
					'header'      : 'join',
					'version_num' : global.NUM_VER,
					'version_txt' : global.TXT_VER
				};

				// Если сервер требует предоставить пароль //
				if ( params.secure ) {
					fn.printf( 'log', 'Master requires secure authentication' );

					if ( self.config.secret !== false ) {
						// Если пароль задан //
						var md5sum = crypto.createHash( 'md5' );
						md5sum.update( params.salt.toString() );
						md5sum.update( self.config.secret );

						join_request.secret = md5sum.digest( 'hex' );
					} else {
						fn.printf( 'error', 'You must specify secret for authentication!' );
						connection.end();
						return;
					}
				}

				// Информация о словаре //
				if ( !self.config.async ) {
					join_request.async               = false;
					join_request.dictionary_size     = self.dictionary.size;
					join_request.dictionary_checksum = self.dictionary.checksum;
				} else {
					join_request.async               = true;
				}

				// Информация о скорости узла //
				join_request.speed = self.speed;

				// Информация об инструменте //
				join_request.tool  = {
					'name'    : self.tool.name,
					'version' : self.tool.version
				};

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