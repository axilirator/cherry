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
var fn            = require( './fn.js' );

module.exports = {
	'drivers': [
		{
			'name' : 'pyrit',
			
			'search' : function() {
				var self  = this;

				return new Promise(		
					function( resolve, reject ) {		
						var pyrit = child_process.exec( 'pyrit help',
							function( error, stdout, stderr ) {
								if ( error === null ) {
									if ( stdout.indexOf( 'Pyrit' ) === 0 && stdout.indexOf( 'attack_passthrough' ) > 0 ) {
										fn.printf( 'debug', '(pyrit): Tool found' );
										resolve( true );
									} else {
										fn.printf( 'debug', '(pyrit): Tool found, but the driver can not manage it' );
										resolve( false );
									}
								} else {
									fn.printf( 'debug', '(pyrit): Tool was not found' );
									resolve( false );
								}
							}
						);
					}
				);
			},

			'benchmark' : function() {
				var self = this;

				return new Promise(
					function( resolve, reject ) {
						var pyrit = child_process.spawn( 'pyrit', [ 'benchmark' ] );

						var speed_regexp  = /([0-9]+)/;
						var result_regexp = /Computed ([0-9]+)/;
						var speed;
						
						pyrit.stdout.on( 'data',
							function( data ) {
								var stdout = data.toString();

								if ( stdout.indexOf( 'Calibrating' ) >= 0 ) {
									fn.printf( 'debug', '(pyrit) Calibrating...' );
								} else if ( stdout.indexOf( 'Running' ) >= 0 ) {
									// Обновление значения скорости в stdout //
									speed = speed_regexp.exec( stdout )[ 0 ];
									fn.printf( 'debug', '(pyrit) Speed is %s PMKs/s', speed );
								} else if ( stdout.indexOf( 'Computed' ) >= 0 ) {
									// Тест скорости завершен //
									speed = result_regexp.exec( stdout )[ 0 ];
									fn.printf( 'debug', '(pyrit) benchmark has been completed with %s PMKs/s', speed );
									resolve( parseInt( speed ) );
								}
							}
						);
					}
				);
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
		var drivers = this.drivers;

		return new Promise( function( resolve, reject ) {
			var len = drivers.length;
			var all = [];

			// Запускаем проверку наличия инструментов //
			for ( var i = 0; i < len; i++ ) {
				fn.printf( 'debug', 'Starting probe for \'%s\' driver...', drivers[ i ].name );
				all.push( drivers[ i ].search() );
			}

			// После выполнения всех проверок //
			Promise.all( all ).then(
				function( results ) {
					for ( var i = 0; i < results.length; i++ ) {
						if ( results[ i ] ) {
							resolve( drivers[ i ] );
							fn.printf( 'log', 'Using %s as cracking tool', drivers[ i ].name );
						}
					}

					reject();
				}
			);
		});
	}
};