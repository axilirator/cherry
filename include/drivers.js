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
			'format' : 'cap',
			
			'search' : function() {
				var self = this;

				return new Promise(		
					function( resolve, reject ) {	
						var version_regexp = /pyrit ([0-9a-z.-]+) /i;
						var pyrit          = child_process.spawn( self.path, [ 'help' ] );
						var found          = false;

						// Обработчик поступающих данных //
						pyrit.stdout.on( 'data',
							function( data ) {
								var stdout = data.toString();

								// Проверка полученных данных //
								if ( stdout.indexOf( 'Pyrit' ) === 0 && stdout.indexOf( 'attack_passthrough' ) > 0 ) {
									fn.printf( 'debug', '(pyrit) Tool found' );
									found = true;

									// Определение версии //
									self.version = version_regexp.exec( stdout )[ 1 ];
									fn.printf( 'debug', '(pyrit) %s version detected', self.version );
								} else {
									fn.printf( 'debug', '(pyrit) Tool found, but the driver can not manage it' );
								}
							}
						);

						// Обработчик ошибки запуска процесса //
						pyrit.on( 'error',
							function() {
								reject( 'not_found' );
							}
						);

						// Обработчик завершения процесса //
						pyrit.on( 'close',
							function( code ) {
								// Если процесс завершился без ошибок //
								if ( code === 0 ) {
									// Если инструмент найден //
									if ( found ) {
										resolve();
									} else {
										reject( 'not_found' );
									}
								} else {
									reject( 'die' );
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
						var pyrit         = child_process.spawn( self.path, [ 'benchmark' ] );
						var speed_regexp  = /([0-9]+)/;
						var speed;
						
						// Обработчик поступающих данных //
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
									speed = parseInt( speed_regexp.exec( stdout )[ 0 ] );
									fn.printf( 'debug', '(pyrit) Benchmark has been completed with %s PMKs/s', speed );
								}
							}
						);

						// Обработчик ошибки запуска процесса //
						pyrit.on( 'error',
							function( error ) {
								reject( 'benchmark' );
							}
						);

						// Обработчик завершения процесса //
						pyrit.on( 'close',
							function( code ) {
								if ( code === 0 ) {
									resolve( speed );
								} else {
									reject( 'die' );
								}
							}
						);
					}
				);
			}
		},

		{
			'name'   : 'hashcat',
			'format' : 'hccap',

			'search' : function() {
				var self = this;

				return new Promise(		
					function( resolve, reject ) {	
						var hashcat = child_process.spawn( self.path, [ '-V' ] );
						var found   = false;

						// Обработчик поступающих данных //
						hashcat.stdout.on( 'data',
							function( data ) {
								var stdout   = data.toString();
								self.version = stdout.substr( 0, stdout.length - 1 );
								found        = true;

								fn.printf( 'debug', '(hashcat) %s version detected', self.version );
							}
						);

						// Обработчик ошибки запуска процесса //
						hashcat.on( 'error',
							function() {
								reject( 'not_found' );
							}
						);

						// Обработчик завершения процесса //
						hashcat.on( 'close',
							function() {
								// В случае `hashcat -V` exit code = 255 //
								if ( found ) {
									resolve();
								} else {
									reject( 'not_found' );
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
						var hashcat      = child_process.spawn( self.path, [ '-m', '2500', '-b' ] );
						var speed_regexp = /speed\/sec: ([0-9\.k]+) words/i;
						var speed;

						// Обработчик поступающих данных //
						hashcat.stdout.on( 'data',
							function( data ) {
								var stdout = data.toString();
								var result = speed_regexp.exec( stdout );

								if ( result ) {
									fn.printf( 'debug', '(hashcat) Benchmarking result: %s', result[ 1 ] );
									speed = parseFloat( result[ 1 ] );

									if ( result[ 1 ].indexOf( 'k' ) > 0 ) {
										speed *= 1000;
									}
								}
							}
						);

						// Обработчик ошибки запуска процесса //
						hashcat.on( 'error',
							function() {
								reject();
							}
						);

						// Обработчик завершения процесса //
						hashcat.on( 'close',
							function( code ) {
								if ( code === 0 ) {
									if ( speed > 0 ) {
										resolve( speed );
									} else {
										reject( 'benchmark' );
									}
								} else {
									reject( 'die' );
								}
							}
						);
					}
				);
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