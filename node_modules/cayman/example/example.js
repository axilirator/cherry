var cli = require( '../cayman.js' );

cli
	.meta( 'name',      'cayman' )
	.meta( 'version',   '1.0.0' )
	.meta( 'copyright', '(C) 2014-2015 Яницкий Вадим' )
	.meta( 'url',       'https://github.com/axilirator/cayman' )
	.meta( 'license',   'This code is distributed under the MIT license' )

	// Global options //
	.option({
		'short_name'  : 'p',
		'full_name'   : 'port',
		'access_name' : 'server_port',
		'description' : 'Port of server'
	})
cli
	.command( 'connect',    'Description of connect' )
		.option({
			'short_name'  : 'i',
			'full_name'   : 'ip',
			'access_name' : 'server_ip',
			'description' : 'IP address of server'
		})
		.action(function( argv ){
			// Do something... //
		})
	.command( 'server',    'Description of server' )
		.option({
			'short_name'  : 'b',
			'full_name'   : 'bind',
			'access_name' : 'bind_ip',
			'description' : 'Binding IP'
		})
		.action(function( argv ){
			// Do something... //
		});

cli.parse( process.argv );