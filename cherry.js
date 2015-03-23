#!/usr/bin/env io

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

var cli = require( 'cayman' );

// Глобальные параметры //
global.NUM_VER = 1;
global.TXT_VER = '0.0.1-alpha';
global.DEBUG   = false;

cli
	.meta( 'name',      'cherry' )
	.meta( 'version',   '0.0.1-alpha' )
	.meta( 'copyright', '(C) 2014-2015 WMN aka Yanitskiy Vadim' )
	.meta( 'url',       'https://github.com/axilirator/cherry' )
	.meta( 'license',   'This code is distributed under the GNU General Public License v3.0' )

	.option({
		'short_name'  : 'd',
		'full_name'   : 'dictionary',
		'access_name' : 'dictionary',
		'description' : 'dictionary for bruteforce'
	})
	.option({
		'full_name'   : 'debug',
		'access_name' : 'debug',
		'description' : 'enable debug mode',
		'action'      : function( value ) {
			if ( value ) {
				global.DEBUG = true;
				console.info( '  [#] Debug mode enabled' );
			}
		}
	});

cli
	.command( 'serve',   'run server on this machine' )
		.option({
			'short_name'  : 'r',
			'full_name'   : 'capturefile',
			'access_name' : 'capturefile',
			'description' : 'target handshake'
		})
		.option({
			'short_name'  : 'p',
			'full_name'   : 'port',
			'access_name' : 'port',
			'description' : 'listening port'
		})
		.option({
			'short_name'  : 's',
			'full_name'   : 'secret',
			'access_name' : 'secret',
			'description' : 'passphrase for authentication'
		})
		.action(
			function( argv ) {
				var master_class = require( './include/master.js' );
				var master       = new master_class( argv );

				master.bootstrap();
			}
		)
	.command( 'connect', 'connect this node to the server' )
		.option({
			'short_name'  : 'i',
			'full_name'   : 'ip',
			'access_name' : 'ip',
			'description' : 'master server\'s IP'
		})
		.option({
			'short_name'  : 'p',
			'full_name'   : 'port',
			'access_name' : 'port',
			'description' : 'master server\'s port'
		})
		.option({
			'short_name'  : 's',
			'full_name'   : 'secret',
			'access_name' : 'secret',
			'description' : 'passphrase for authentication'
		})
		.option({
			'full_name'   : 'async',
			'access_name' : 'async',
			'description' : 'asynchronous mode, requires a individual dictionary'
		})
		.action(
			function( argv ){
				var slave_class = require( './include/slave.js' );
				var slave       = new slave_class( argv );

				slave.bootstrap();
			}
		)
	.command( 'help', 'show this help' )
		.action(
			function(){
				this.help();
			}
		)
	// Запуск программы //
	.parse( process.argv );