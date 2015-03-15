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

var fs            = require( 'fs' );
var child_process = require( 'child_process' );
var chain         = require( './chains.js' );
var fn            = require( './fn.js' );

function dictionary( path ) {
	this.path     = path; // Путь к словарю
	this.size     = 0;    // Размер словаря
	this.checksum = null; // CRC32
}

dictionary.prototype.bootstrap = function() {
	var self = this;

	return new Promise(
		function( resolve, reject ) {
			var main = new chain([
				// Проверка существования файла //
				function( chain ) {
					fs.stat( self.path,
						function( error, stats ) {
							if ( error ) {
								fn.printf( 'error', "Cannot open dictionary '%s'!", self.path );
								reject();
							} else {
								// Если путь ссылается на существующий файл //
								if ( stats.isFile() ) {
									self.size = stats.size;
									chain.next();
								} else {
									fn.printf( 'error', "'%s' is not a file!", self.path );
									reject();
								}
							}
						}
					);
				},

				// Рассчет контрольной суммы //
				function( chain ) {
					var crc32 = child_process.exec( 'crc32 ' + self.path,
						function( error, stdout, stderr ) {
							if ( error === null ) {
								// Отрезаем символ перевода строки //
								self.checksum = stdout.substr( 0, stdout.length - 1 );
								chain.next();
							} else {
								fn.printf( 'error', "Cannot calculate crc32. Have you a crc32 utility?" );
								reject();
							}
						}
					);
				},

				// Выполняем обещание //
				resolve
			]);

			main.run();
		}
	);
};

module.exports = dictionary;