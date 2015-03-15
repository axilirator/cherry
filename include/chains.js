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

/**
 * Основной класс модуля.
 * 
 * @constructor
 * @param  {array} nodes Массив функций и/или объектов Promise
 */
function chain( nodes ) {
	this.nodes    = nodes;        // Ссылка на массив звеньев цепи
	this.count    = nodes.length; // Количество элементов цепи
	this.pointer  = 0;            // Дескриптор цепи, указывающий на текущее исполняемое звено
	this.finished = false;        // Флаг завершенности цепочки
	this.loop     = false;        // Зацикливает цепочку
	this.storage  = {};           // Промежуточное хранилище данных, используется звеньями

	// Привязанные события
	this.events   = {
		// onFinish - возникает при завершении выполнения цепи
		// onStop   - возникает при разрыве цепи (вызов метода stop или отклонение обещания)
		// onJump   - возникает при прыжке между звеньями (методы jumpDown, jumpTo)
		// onSkip   - возникает при прыжке через элементы цепи (метод skip)
		// onPush   - возникает при добавлении нового узла в цепь
		// onError  - возникает в случае ошибки при выполнении элемента цепи
	};

	// Добавление методов управления цепью с привязкой к this //
	for ( var i in inScope ) {
		this[ i ] = inScope[ i ].bind( this );
	}
}

var inScope = {
	// Метод перехода к следующему звену //
	'next' : function() {
		// Перемещаем дескриптор вперед //
		this.pointer++;

		// Если после звена есть другие звенья, вызываем следующее //
		if ( this.pointer < this.count ) {
			this.callNode();
		} else {
			// Событие onFinish //
			if ( this.events.finish ) {
				this.events.finish();
			}

			// Если цепь зациклена, передаем управление первому элементу //
			if ( this.loop ) {
				this.pointer  = 0;
				this.callNode();
			} else {
				this.finished = true;
			}
		}
	},

	// Метод перехода к звену, находящемуся через count звеньев //
	'skip' : function( count ) {
		// Если целевое звено в пределах достигаемости //
		if ( this.pointer + count + 1 < this.count ) {
			// Перемещаем указатель на адрес нового узла //
			this.pointer += count + 1;

			// Запускаем целевое звено //
			this.callNode();

			// Если есть обработчик данного события //
			if ( this.events.skip ) {
				this.events.skip();
			}
		} else {
			// Прыжок за верхний предел //
			throw 'Leap beyond end!';
		}
	},

	// Обрыв цепочки действий //
	'stop' : function() {
		// Событие onStop
		if ( this.events.stop ) {
			this.events.stop();
		}
	},

	// Прыжок к предыдущему звену //
	'jumpDown' : function() {
		// Если текущее звено не первое //
		if ( this.pointer > 0 ) {
			// Смещаем указатель //
			this.pointer--;

			// Вызываем предыдущее звено //
			this.callNode();

			// Если есть обработчик данного события //
			if ( this.events.jump ) {
				this.events.jump();
			}
		} else {
			// Прыжок за нижний предел //
			throw 'Leap beyond start!';
		}
	},

	// Прыжок к звену с адресом pointer //
	'jumpTo' : function( pointer ) {
		// Если целевое звено в переделах достигаемости //
		if ( pointer >= 0 && pointer < this.count ) {
			// Запускаем целевое звено //
			this.callNode();

			// Если есть обработчик данного события //
			if ( this.events.jump ) {
				this.events.jump();
			}
		} else {
			// Прыжок за пределы //
			throw 'Leap beyond!';
		}
	},

	'push' : function( node ) {
		// Добавляем новое звено //
		this.nodes.push( node );
		this.count++;

		// Если есть обработчик данного события //
		if ( this.events.push ) {
			this.events.push();
		}

		// Если цепочка уже завершена, запускаем добавленное звено //
		if ( this.finished ) {
			this.finished = false;
			this.pointer++;
			this.callNode();
		}
	}
};

/**
 * Вызывает звено, на которое указывает указатель this.pointer.
 * @param  {array}  args Массив аргументов, передаваемых звену
 * @return this
 */
chain.prototype.callNode = function() {
	// Определяем тип звена //
	var type  = typeof( this.nodes[ this.pointer ] );
	var chain = this;

	if ( type === 'function' ) {
		// Если это функция //
		try {
			this.nodes[ this.pointer ]( this, this.storage );
		} catch ( e ) {
			// Если в звене возникла ошибка //
			if ( this.events.error ) {
				// Передаем ошибку и номер узла обработчику //
				this.events.error( e, this.pointer );
			} else {
				// Ошибка всплывает //
				throw e;
			}
		}
	} else if ( type === 'object' && this.nodes[ this.pointer ].then ) {
		// Если это объект Promise //
		this.nodes[ this.pointer ].then(
			// Успешное выполнение обещания //
			function( result ) {
				for ( var i in result ) {
					chain.storage[ i ] = result[ i ];
				}

				chain.next();
			},

			// Отклонение обещания //
			function( e ) {
				// Если назначен обработчик ошибок //
				if ( chain.events.error ) {
					chain.events.error( e, chain.pointer );
				} else {
					throw e;
				}
			}
		);
	}

	return this;
};

/**
 * Запускает цепочку.
 * @return this
 */
chain.prototype.run = function() {
	// Если в цепи есть звенья //
	if ( this.count ) {
		this.callNode();
	}

	return this;
};

/**
 * Зацикливает цепь.
 * @return this
 */
chain.prototype.loop = function() {
	this.loop = true;

	return this;
};

// Привязка обработчиков событий //

chain.prototype.onFinish = function( handler ) {
	this.events.finish = handler;

	return this;
};

chain.prototype.onStop = function( handler ) {
	this.events.stop = handler;

	return this;
};

chain.prototype.onJump = function( handler ) {
	this.events.jump = handler;

	return this;
};

chain.prototype.onSkip = function( handler ) {
	this.events.skip = handler;

	return this;
};

chain.prototype.onPush = function( handler ) {
	this.events.push = handler;

	return this;
};

chain.prototype.onError = function( handler ) {
	this.events.error = handler;

	return this;
};

// Экспорт класса //
module.exports = chain;