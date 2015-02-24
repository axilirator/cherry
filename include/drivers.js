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

var child_process = require( 'child_process' );

module.exports = {
	'all': [
		{
			'name' : 'pyrit',
			
			'search' : function( i, done ) {				
				var pyrit = child_process.exec( 'pyrit', [ 'help' ] );
				var self  = this;

				pyrit.stdout.on( 'data', function( stdout ){
					// Проверяем пришедшие данные на наличие строки Pyrit //
					// Регулярным выражением получаем версию //
					// Если все ок, запускаем success()
					
					done( i, self );
				});

				pyrit.on( 'error', function(){
					done( i, false );
				});
			},

			'benchmark' : function() {
				return 6666;
			}
		}
	],

	/**
	 * Проверяет возможность запуска указанной программы.
	 * Используется для поиска инструментов подбора пароля.
	 *
	 * @param  {string} Название проверяемой программы
	 * @return {object} Интерфейс найденного инструмента
	*/
	'search': function( probe ) {
		var drivers = this.all;

		return new Promise( function( resolve, reject ) {
			var len    = drivers.length;
			var status = new Array( len );
			var j      = 0;

			for ( var i = 0; i < len; i++ ) {
				drivers[ i ].search( i, done );
			}

			/**
			 * Вызывается каждый раз, когда драйвер завершает проверку.
			 * @param  {[type]}   i      [description]
			 * @param  {[type]}   result [description]
			 * @return {Function}        [description]
			 */
			function done( i, result ) {
				status[ i ] = result;

				// Если все драйверы выполнили проверку //
				if ( ++j === len ) {
					finish();
				}
			}

			/**
			 * Вызывается, когда все драйверы завершили проверку.
			 * @return {[type]} [description]
			 */
			function finish() {
				var found = false;

				// Перебор результатов проверок //
				for ( var i = 0; i < len; i++ ) {
					if ( status[ i ] !== false ) {
						// Первый найденный инструмент считается приоритетным //
						found = status[ i ];
						break;
					}
				}

				if ( found ) {
					resolve( found );
				} else {
					reject();
				}
			}
		});
	}
};