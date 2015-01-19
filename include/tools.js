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

var syncExec = require( 'exec-sync' );

module.exports = {
	/*
		Массив поддерживаемых инструментов. Каждый инструмент представляет интерфейс 
		в виде объекта следующего содержания:

		@name      {string}   Название инструмента, которое будет отображаться в интерфейсе программы.
		@exec      {array}    Массив возможных названий инструмента в системе.
		
		int benchmark() Выполняет тест производительности, возвращает значение скорости перебора.
			@syntax benchmark()
			@return {number} Скорость перебора

		bln run() Запускает перебор паролей.
			@syntax run( params )
			Объект params содержит следующие данные:
				@param {object} handlers    Объект обработчиков событий (*)
				@param {string} capturefile Путь к файлу handshake
				@param {string} dictionary  Путь к файлу словаря
				@param {number} start       Начальная позиция блока
				@param {number} end         Конечная позиция блока
			@return {boolean} Успешность запуска

		bln stop() Останавливает перебор паролей
			@syntax stop()
			@return {boolean} Успешность остановки перебора

		int speed() Возвращает текущую скорость перебора паролей
			@syntax speed()
			@return {number} Текущая скорость

		(*) Обработчики событий.
		Первым параметром метода run является объект обработчиков событий.

		#found( password ) Вызывается в случае успешного подбора пароля.
		#finish()          Вызывается при достижении 
	 */
	'all': [
		{
			'name': 'hashcat',
			'exec': process.arch === 'x64' ? 
				[
					// GPU x64 //
					'oclHashcat64', 'oclHashcat64.bin', 'cudaHashcat64', 'cudaHashcat64.bin',
					// CPU x64 //
					'hashcat-cli64', 'hashcat-cliAVX', 'hashcat-cliXOP', 'hashcat-cli64.bin', 
					'hashcat-cliAVX.bin', 'hashcat-cliXOP.bin', 'hashcat-cli64.app'
				] : [
					// GPU x86 //
					'oclHashcat32', 'oclHashcat32.bin', 'cudaHashcat32', 'cudaHashcat32.bin',
					// CPU x86 //
					'hashcat-cli32', 'hashcat-cli32.bin'
				]

		},

		{
			'name': 'pyrit',
			'exec': [ 'pyrit' ],

			'run': function( params ) {
				var process = syncExec(  );
			},

			'benchmark': function() {
				var regexp = /computed (.+) PMKs\/s total/i;

				return 65000;

				var result = regexp.exec( syncExec( 'pyrit benchmark' ) );

				return result === null ? 
					false : Math.round( parseFloat( result[ 1 ] ) );
			}
		},

		{
			'name': 'aircrack-ng',
			'exec': [ 'aircrack-ng' ]
		}
	],

	/**
	 * Проверяет возможность запуска указанной программы.
	 * Используется для поиска инструментов подбора пароля.
	 *
	 * @param  {string} Название проверяемой программы
	 * @return {object} Интерфейс найденного инструмента
	*/
	'find_tool': function( probe ) {
		var tools  = this.all;
		var result = null;

		// Проверка доступности инструментов //
		for ( var i = 0; i < tools.length; i++ ) {
			for ( var j = 0; j < tools[ i ].exec.length; j++ ) {
				result = syncExec( tools[ i ].exec[ j ], true );

				if ( result.stderr.length === 0 ) {
					// Инструмент найден! //
					if ( probe ) {
						if ( tools[ i ].name === probe ) {
							return tools[ i ];
						}
					} else {
						return tools[ i ];
					}
				}
			}
		}

		return false;
	}
};