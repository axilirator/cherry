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

var cli = require( '../cayman/cayman.js' );

global.DEBUG = false;

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
	.command( 'serve',   'run master-node server on this machine' )
		.option({
			'short_name'  : 'r',
			'full_name'   : 'capturefile',
			'access_name' : 'capturefile',
			'description' : 'target handshake'
		})
		.option({
			'short_name'  : 'p',
			'full_name'   : 'port',
			'access_name' : 'master_port',
			'description' : 'listening port'
		})
		.option({
			'short_name'  : 's',
			'full_name'   : 'secret',
			'access_name' : 'master_secret',
			'description' : 'passphrase for authentication'
		})
		.action(function( argv ){
			var master_class = require( './include/master.js' );
			var master       = new master_class( argv );

			master.check_cfg()
				&& master.start_server();
		})
	.command( 'connect', 'connect this node to the cluster as worker-node' )
		.option({
			'short_name'  : 'i',
			'full_name'   : 'master-ip',
			'access_name' : 'master_ip',
			'description' : 'master-node server\'s IP'
		})
		.option({
			'short_name'  : 'p',
			'full_name'   : 'master-port',
			'access_name' : 'master_port',
			'description' : 'master-node server\'s port'
		})
		.option({
			'short_name'  : 's',
			'full_name'   : 'master-secret',
			'access_name' : 'master_secret',
			'description' : 'passphrase for authentication'
		})
		.option({
			'short_name'  : 't',
			'full_name'   : 'cracking-tool',
			'access_name' : 'tool',
			'description' : 'cracking tool: hashcat, pyrit or aircrack-ng'
		})
		.option({
			'full_name'   : 'async',
			'access_name' : 'worker_async',
			'description' : 'asynchronous mode, requires a individual dictionary'
		})
		.action(function( argv ){
			var worker_class = require( './include/worker.js' );
			var worker       = new worker_class( argv );

			worker.check_cfg()
				.then(
					function() {
						return worker.find_tool();
					}
				).then(
					function() {
						worker.connect();
					}
				);
		})
	.command( 'help',    'show this help' )
		.action(function(){
			this.help();
		})
	// Запуск программы //
	.parse( process.argv );