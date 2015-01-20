#include <stdio.h>
#include <iostream>
#include <stdlib.h>

using namespace std;

int main( int argc, char* argv[] ) {
	FILE * source;
	char    *line = NULL;
	size_t  len   = 0;
	ssize_t read;

	// Проверка количества аргументов //
	if ( argc != 4 ) {
		printf( "  Usage: knife <file> <start> <end>\n" );
		return 1;
	}

	char *fname = argv[ 1 ];         // Название файла
	int  start  = atoi( argv[ 2 ] ); // Начальная позиция
	int  end    = atoi( argv[ 3 ] ); // Конечная позиция

	// Итератор количества строк //
	int i = 0;

	// Пытаемся открыть файл //
	source = fopen( fname, "r" );

	if ( source == NULL ) {
		printf( "Can not read file \"%s\"!\n", fname );
		return 1;
	}

	// Перебор строк файла //
	while ( ( read = getline( &line, &len, source ) ) != -1 ) {
		// Если номер текущей строки меньше начальной позиции //
		if ( ++i < start  ) {
			continue;
		}

		// Если номер текущей строки больше конечной позиции //
		if ( i > end ) {
			break;
		}

		// Вывод строки //
		cout << line;
	}

	fclose( source );
	return 0;
}