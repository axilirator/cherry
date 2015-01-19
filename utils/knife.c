#include <stdio.h>
#include <iostream>
#include <stdlib.h>

using namespace std;

int main( int argc, char* argv[] ) {
	FILE * source;

	// Проверка количества аргументов //
	if ( argc != 4 ) {
		printf( "  Usage: knife <file> <offset> <count>\n" );
		return 1;
	}

	char *fname = argv[ 1 ];
	int  offset = atoi( argv[ 2 ] );
	int  count  = atoi( argv[ 3 ] );

	char    *line = NULL;
	size_t  len    = 0;
	ssize_t read;

	int i = 0;
	int j = 0;

	// Пытаемся открыть файл //
	source = fopen( fname, "r" );

	if ( source == NULL ) {
		printf( "Can not read file \"%s\"!\n", fname );
		return 1;
	}

	while ( ( read = getline( &line, &len, source ) ) != -1 ) {
		// Если номер текущей строки меньше отступа //
		if ( ++i < offset ) {
			continue;
		}

		// Если уже выведено нужное количество строк //
		if ( ++j > count ) {
			break;
		}

		// Вывод строки //
		cout << line;
	}

	fclose( source );
	return 0;
}