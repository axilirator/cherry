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
			'name'   : 'pyrit',
			'path'   : 'pyrit',
			
			'search' : function() {
				var self = this;

				return new Promise(		
					function( resolve, reject ) {	
						var version_regexp = /pyrit ([0-9a-z.-]+) /i;
						var pyrit          = child_process.exec( self.path + ' help',
							function( error, stdout, stderr ) {
								if ( error === null ) {
									if ( stdout.indexOf( 'Pyrit' ) === 0 && stdout.indexOf( 'attack_passthrough' ) > 0 ) {
										fn.printf( 'debug', '(pyrit) Tool found' );

										// Определение версии //
										self.version = version_regexp.exec( stdout )[ 1 ];
										fn.printf( 'debug', '(pyrit) %s version detected', self.version );

										resolve( true );
									} else {
										fn.printf( 'debug', '(pyrit) Tool found, but the driver can not manage it' );
										resolve( false );
									}
								} else {
									fn.printf( 'debug', '(pyrit) Tool was not found' );
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
						var pyrit = child_process.spawn( self.path, [ 'benchmark' ] );

						var speed_regexp  = /([0-9]+)/;
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
									speed = speed_regexp.exec( stdout )[ 0 ];
									fn.printf( 'debug', '(pyrit) benchmark has been completed with %s PMKs/s', speed );
									resolve( parseInt( speed ) );
								}
							}
						);
					}
				);
			},

			'speed' : function() {
				var self = this;

				return new Promise(
					function( resolve, reject ) {

					}
				);
			}
		},

		{
			'name'   : 'hashcat',

			'search' : function() {
				  
			}
		}
	],

	/**
	 * Выполняет проверку наличия драйвера указанного инструмента.
	 *
	 * @param  {string}         Название проверяемой программы
	 * @return {boolean|object} Результат проверки
	*/
	'search': function( probe ) {
		var drivers = this.drivers;
		var count   = drivers.length;
		
		for ( var i = 0; i < count; i++ ) {
			if ( drivers[ i ].name === probe ) {
				return drivers[ i ];
			}
		}

		return false;
	}
};