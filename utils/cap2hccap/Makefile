DEFTOOL= /usr/bin/i686-mingw32- /usr/bin/x86_64-w64-mingw32- /usr/bin/i686-pc-linux-gnu- /usr/bin/

ifndef TOOL_PREFIX
TOOL_PREFIX	=
endif
ifndef OSNAME
OSNAME		= $(shell uname -s | sed -e 's/.*CYGWIN.*/cygwin/g' -e 's,/,-,g')
endif

WINEXT:=.exe
LNXEXT:=.bin

ifeq ($(OSNAME), cygwin)
EXT		= $(WINEXT)
PIC		= -fPIC
CC              = $(TOOL_PREFIX)gcc-4
else
EXT		= $(LNXEXT)
CC              = $(TOOL_PREFIX)gcc
endif

#OPTFLAGS        = -D_FILE_OFFSET_BITS=64 -DMAX_NETWORKS=10
OPTFLAGS        = -D_FILE_OFFSET_BITS=64
CFLAGS		= -g -Wall -O0
DIST_CFLAGS	= -O2 -Iinclude $(OPTFLAGS) $(PIC)
# to enable when debug and major developing is done
#CFLAGS		= -O2

# manual override
#CC = gcc
#CC = /opt/cross/mingw64/bin/x86_64-w64-mingw32-gcc
#CC = x86_64-w64-mingw32-gcc
CFLAGS 		+= -Iinclude $(OPTFLAGS) $(PIC)

BINS		= cap2hccap$(EXT)

all:	$(BINS)

cap2hccap$(EXT):	cap2hccap.c Makefile
	$(CC) $(CFLAGS) -o $@ $<

dist:
	tar czf cap2hccap.tar.gz cap2hccap.c README Makefile include --exclude include/.svn
	tar cjf cap2hccap.tar.bz2 cap2hccap.c README Makefile include --exclude include/.svn
	$(foreach c, $(DEFTOOL),$(call dist_make, $(c)))


define dist_make

$(if $(findstring mingw, $(1)),
	$(if $(findstring 64, $(1)),
		$(1)gcc $(DIST_CFLAGS) -o cap2hccap64$(WINEXT) ./cap2hccap.c,
		$(1)gcc $(DIST_CFLAGS) -o cap2hccap$(WINEXT) ./cap2hccap.c
	),
	$(if $(findstring i686, $(1)),
		$(1)gcc $(DIST_CFLAGS) -o cap2hccap$(LNXEXT) ./cap2hccap.c,
		$(1)gcc $(DIST_CFLAGS) -o cap2hccap64$(LNXEXT) ./cap2hccap.c
	)

)
endef
