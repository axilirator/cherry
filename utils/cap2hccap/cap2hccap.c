#include <stdio.h>
#include <stdlib.h>
#include <dirent.h>
#include <fcntl.h>
#include <errno.h>
#include <unistd.h>
#include <sys/types.h>
#include <string.h>
#include <libgen.h>
#ifdef UINT16
	#define u_int16_t UINT16;
#endif
#include "pcap.h"
#include "byteorder.h"
#define BROADCAST (uchar*)"\xFF\xFF\xFF\xFF\xFF\xFF"
#define SWAP32(x)       \
    x = ( ( ( x >> 24 ) & 0x000000FF ) | \
          ( ( x >>  8 ) & 0x0000FF00 ) | \
          ( ( x <<  8 ) & 0x00FF0000 ) | \
          ( ( x << 24 ) & 0xFF000000 ) );
/* workaround for arm compiling */
#ifndef O_BINARY
	#define O_BINARY 0
#endif
#define MAX_BUFF (PATH_MAX)

typedef struct
{
	int off1;
	int off2;
	void *buf1;
	void *buf2;
}
read_buf;

typedef struct
{
	char          essid[36];

	unsigned char mac1[6];
	unsigned char mac2[6];
	unsigned char nonce1[32];
	unsigned char nonce2[32];

	unsigned char eapol[256];
	int           eapol_size;

	int           keyver;
	unsigned char keymic[16];

} hccap_t;

struct wpa_hdsk
{
	unsigned char stmac[6];
	unsigned char snonce[32];
	unsigned char anonce[32];
	unsigned char keymic[16];
	unsigned char eapol[256];
	int eapol_size;
	int keyver;
	int state;
};

struct	apoint
{
	unsigned char bssid[6];
	char essid[33];
	int crypt;
	struct	station *st_lst;
	hccap_t	wpa;
	struct	apoint *next;
};

struct station
{
	unsigned char mac[6];
	struct apoint 	*parent;
	struct wpa_hdsk	wpa;
	struct station	*next;
};

char *essid; // essid filter

int atomic_read( read_buf *rb, int fd, int len, void *buf )
{
	int n;

	if( rb->buf1 == NULL )
	{
		rb->buf1 = malloc( 65536 );
		rb->buf2 = malloc( 65536 );

		if( rb->buf1 == NULL || rb->buf2 == NULL )
			return( 0 );

		rb->off1 = 0;
		rb->off2 = 0;
	}

	if( len > 65536 - rb->off1 )
	{
		rb->off2 -= rb->off1;

		memcpy( rb->buf2, rb->buf1 + rb->off1, rb->off2 );
		memcpy( rb->buf1, rb->buf2, rb->off2 );

		rb->off1 = 0;
	}

	if( rb->off2 - rb->off1 >= len )
	{
		memcpy( buf, rb->buf1 + rb->off1, len );
		rb->off1 += len;
		return( 1 );
	}
	else
	{
		n = read( fd, rb->buf1 + rb->off2, 65536 - rb->off2 );

		if( n <= 0 )
			return( 0 );

		rb->off2 += n;

		if( rb->off2 - rb->off1 >= len )
		{
			memcpy( buf, rb->buf1 + rb->off1, len );
			rb->off1 += len;
			return( 1 );
		}
	}

	return( 0 );
}

enum _log_level
{
	quiet,
	error,
	warning,
	info,
	verbose,
	verbose2,
	verbose3,
	debug
};

enum _log_level log_level = info;
char err_buff[MAX_BUFF];

void w_report_error(const char *msg, const char *file, int line_no, const char *caller, int use_perror, int fatal, enum _log_level call_level)
{
	char format[MAX_BUFF];
	FILE *stream;
	static const char *log_level_str[] =
	{
		"quiet",
		"error",
		"warning",
		"info",
		"verbose",
		"verbose2",
		"verbose3",
		"debug",
	};
	static int max_level_len = 8;
	static int max_file_len = 11;
	static int max_line_len = 4;

	file = basename((char *)file);
	if(log_level == debug)
		snprintf(	format,MAX_BUFF,
							"[%*s:%*d - %-*s] %s: %s",
							max_file_len,file,max_line_len,line_no,max_level_len,log_level_str[call_level],caller,msg);
	else
		snprintf( format,MAX_BUFF,
							"[%-*s]\t%s",max_level_len,log_level_str[call_level],msg);

	if(call_level <  info)
		stream = stderr;
	else
		stream = stdout;

	if(use_perror)
		perror(format);
	else if( call_level <= log_level )
	{
		fprintf(stream,"%s",format);
		fprintf(stream,"\n");
	}


	if(fatal)
	{
		#ifdef _PTHREAD_H
			pthread_exit((void *) EXIT_FAILURE);
		#else
			exit(EXIT_FAILURE);
		#endif
	}
	return;
}

void *w_malloc(size_t bytes, const char *file, int line_no)
{
	void *memory = NULL;
	memory = malloc(bytes);
	if (!memory)
		w_report_error("", file, line_no,__func__, 0, 1, error);
	memset(memory,'\0',bytes);
	return memory;
}

#define report_error(m,p,f,l)			(w_report_error((m),__FILE__,__LINE__,__func__,(p),(f),(l)))
#define malloc(s)									(w_malloc((s),__FILE__,__LINE__))
void cap2hccap(const char *src, const char *dst)
{
	int fd, n, z;
	read_buf rb;
	FILE 	*fp_hccap;
	uchar *buffer,
				*h80211,
				*p;
	static uchar ZERO[32] =
	"\x00\x00\x00\x00\x00\x00\x00\x00"
	"\x00\x00\x00\x00\x00\x00\x00\x00"
	"\x00\x00\x00\x00\x00\x00\x00\x00"
	"\x00\x00\x00\x00\x00\x00\x00\x00";
	unsigned char bssid[6],dest[6],stmac[6];

	struct pcap_pkthdr pkh;
	struct pcap_file_header pfh;
	struct apoint		*ap_lst=NULL,*ap_cur,*ap_prev;
	struct station	*st_cur,*st_prev;

	memset( &rb, 0, sizeof( rb ) );
	fd = 0;

	buffer = (uchar *) malloc( 65536 );

	h80211 = buffer;
	err_buff[0] = '\0';

	if( src == NULL || dst == NULL )
		report_error("called with NULL argument.",0,1,error);
	else if( ( fd = open( src, O_RDONLY | O_BINARY ) ) < 0 )
		strncpy(err_buff, src,MAX_BUFF);
	else if( ! atomic_read( &rb, fd, 4, &pfh ) )
		strncpy(err_buff, src,MAX_BUFF);
	else if( pfh.magic != TCPDUMP_MAGIC && pfh.magic != TCPDUMP_CIGAM )
		snprintf(err_buff,MAX_BUFF,"file \"%s\" is not a valid pcap file.", src);
	else if( ! atomic_read( &rb, fd, 20, (uchar *) &pfh + 4 ) )
		snprintf(err_buff,MAX_BUFF,"reading header from file \"%s\".", src);
#if defined(F_SETFL) && defined(O_NONBLOCK)
	else if( fcntl( fd, F_SETFL, O_NONBLOCK ) < 0 )
		snprintf(err_buff,MAX_BUFF,"setting non blocking access on file \"%s\".", src);
#endif
	else
	{
		if( pfh.magic == TCPDUMP_CIGAM )
			SWAP32( pfh.linktype );

		if( pfh.linktype != LINKTYPE_IEEE802_11 &&
				pfh.linktype != LINKTYPE_PRISM_HEADER &&
				pfh.linktype != LINKTYPE_RADIOTAP_HDR &&
				pfh.linktype != LINKTYPE_PPI_HDR )
			snprintf(err_buff,MAX_BUFF,"file \"%s\" is not a 802.11 (wireless) capture.", src);
	}

	if(err_buff[0] != '\0')
	{
		if(strncmp(err_buff,src,MAX_BUFF) == 0 || strncmp(err_buff,dst,MAX_BUFF) == 0)
			report_error(err_buff,1,0,error);
		else
			report_error(err_buff,0,0,error);

		if(fd != 0)
			close(fd);
		return;
	}

	while( atomic_read( &rb, fd, sizeof( pkh ), &pkh ))
	{
		if( pfh.magic == TCPDUMP_CIGAM )
			SWAP32( pkh.caplen );

		if( pkh.caplen <= 0 || pkh.caplen > 65535 )
		{
			report_error("invalid packet capture length.",0,0,error);
			report_error("probably capture file is corrupted.",0,0,verbose);
			break;
		}

		if( ! atomic_read( &rb, fd, pkh.caplen, buffer ) )
		{
			report_error("cannot read packet data.",0,0,error);
			break;
		}

		h80211 = buffer;

		if( pfh.linktype == LINKTYPE_PRISM_HEADER )
		{
			/* remove the prism header */

			if( h80211[7] == 0x40 )
				n = 64;
			else
			{
				n = *(int *)( h80211 + 4 );

				if( pfh.magic == TCPDUMP_CIGAM )
					SWAP32( n );
			}

			if( n < 8 || n >= (int) pkh.caplen )
				continue;

			h80211 += n; pkh.caplen -= n;
		}

		if( pfh.linktype == LINKTYPE_RADIOTAP_HDR )
		{
			/* remove the radiotap header */

			n = *(unsigned short *)( h80211 + 2 );

			if( n <= 0 || n >= (int) pkh.caplen )
				continue;

			h80211 += n; pkh.caplen -= n;
		}

		if( pfh.linktype == LINKTYPE_PPI_HDR )
		{
			/* Remove the PPI header */

			n = le16_to_cpu(*(unsigned short *)( h80211 + 2));

			if( n <= 0 || n>= (int) pkh.caplen )
				continue;

			/* for a whole Kismet logged broken PPI headers */
			if ( n == 24 && le16_to_cpu(*(unsigned short *)(h80211 + 8)) == 2 )
				n = 32;

			if( n <= 0 || n>= (int) pkh.caplen )
				continue;

			h80211 += n; pkh.caplen -= n;
		}

		/* skip packets smaller than a 802.11 header */

		if( pkh.caplen < 24 )
			continue;

		/* skip (uninteresting) control frames */

		if( ( h80211[0] & 0x0C ) == 0x04 )
			continue;

		/* locate the access point's MAC address */

		switch( h80211[1] & 3 )
		{
			case  0: memcpy( bssid, h80211 + 16, 6 ); break;  //Adhoc
			case  1: memcpy( bssid, h80211 +  4, 6 ); break;  //ToDS
			case  2: memcpy( bssid, h80211 + 10, 6 ); break;  //FromDS
			case  3: memcpy( bssid, h80211 + 10, 6 ); break;  //WDS -> Transmitter taken as BSSID
		}

		switch( h80211[1] & 3 )
		{
			case  0: memcpy( dest, h80211 +  4, 6 ); break;  //Adhoc
			case  1: memcpy( dest, h80211 + 16, 6 ); break;  //ToDS
			case  2: memcpy( dest, h80211 +  4, 6 ); break;  //FromDS
			case  3: memcpy( dest, h80211 + 16, 6 ); break;  //WDS -> Transmitter taken as BSSID
		}

		if( memcmp( bssid, BROADCAST, 6 ) == 0 )
			continue;

		/* locate the station MAC in the 802.11 header */

		memcpy(stmac,BROADCAST,6); // used as flag

		switch( h80211[1] & 3 )
		{
			case  0: 	memcpy( stmac, h80211 + 10, 6 ); break;
			case  1: 	memcpy( stmac, h80211 + 10, 6 ); break;
			case  2:
								if( (h80211[4]%2) == 0 ) /* if is a broadcast packet */
									memcpy( stmac, h80211 +  4, 6 );
								break;
		}

		/* search if access point already exist */

		ap_prev = NULL;
		ap_cur = ap_lst;
		for(ap_cur=ap_lst;ap_cur!=NULL;ap_prev=ap_cur,ap_cur=ap_cur->next)
			if( ! memcmp( ap_cur->bssid, bssid, 6 ) )
				break;

		if(ap_cur == NULL)
		{
			ap_cur = malloc(sizeof(struct apoint));
			if(ap_lst == NULL)
				ap_lst = ap_cur;
			else
				ap_prev->next = ap_cur;

			memcpy(ap_cur->bssid,bssid,6);
			ap_cur->crypt = -1;
		}

		/* search if station already exist */

		st_cur = NULL;

		if(memcmp(stmac,BROADCAST,6) != 0 && memcmp(ap_cur->bssid, stmac,6) != 0)
		{

			for(st_prev = NULL, st_cur=ap_cur->st_lst;
					st_cur != NULL; st_prev = st_cur, st_cur = st_cur->next)
				if( ! memcmp( st_cur->mac, stmac, 6) )
					break;

			/* if it's a new supplicant, add it */

			if( st_cur == NULL )
			{
				st_cur = malloc(sizeof(struct station));

				if( ap_cur->st_lst == NULL )
					ap_cur->st_lst = st_cur;
				else
					st_prev->next = st_cur;

				memcpy( st_cur->mac, stmac, 6 );
			}
		}

		/* packet parsing: Beacon or Probe Response */

		if( h80211[0] == 0x80 ||
				h80211[0] == 0x50 )
		{
			if( ap_cur->crypt < 0 )
				ap_cur->crypt = ( h80211[34] & 0x10 ) >> 4;

			p = h80211 + 36;

			while( p < h80211 + pkh.caplen )
			{
				if( p + 2 + p[1] > h80211 + pkh.caplen )
					break;

				if( p[0] == 0x00 && p[1] > 0 && p[2] != '\0' )
				{
					/* found a non-cloaked ESSID */

					n = ( p[1] > 32 ) ? 32 : p[1];

					memset( ap_cur->essid, 0, 33 );
					memcpy( ap_cur->essid, p + 2, n );
				}

				p += 2 + p[1];
			}
		}

		/* packet parsing: Association Request */

		if( h80211[0] == 0x00 )
		{
			p = h80211 + 28;

			while( p < h80211 + pkh.caplen )
			{
				if( p + 2 + p[1] > h80211 + pkh.caplen )
					break;

				if( p[0] == 0x00 && p[1] > 0 && p[2] != '\0' )
				{
					n = ( p[1] > 32 ) ? 32 : p[1];

					memset( ap_cur->essid, 0, 33 );
					memcpy( ap_cur->essid, p + 2, n );
				}
				st_cur->wpa.state = 0;
				p += 2 + p[1];
			}
		}

		/* packet parsing: Association Response */

		if( h80211[0] == 0x10 )
			if(st_cur != NULL)
				st_cur->wpa.state = 0;

		/* check if data and station isn't the bssid */

		if( ( h80211[0] & 0x0C ) != 0x08 || st_cur == NULL )
			continue;

		/* check minimum size */

		z = ( ( h80211[1] & 3 ) != 3 ) ? 24 : 30;
		if ( ( h80211[0] & 0x80 ) == 0x80 )
			z+=2; /* 802.11e QoS */

		if( z + 16 > (int) pkh.caplen )
			continue;

		/* check the SNAP header to see if data is WEP encrypted */

		if( ( h80211[z] != h80211[z + 1] || h80211[z + 2] != 0x03 ) && (h80211[z + 3] & 0x20) != 0)
			ap_cur->crypt = 3;

		/* no encryption */
		if( ap_cur->crypt < 0 )
			ap_cur->crypt = 0;

		z += 6;

		/* check ethertype == EAPOL */

		if( h80211[z] != 0x88 || h80211[z + 1] != 0x8E )
			continue;

		z += 2;

		/* type == 3 (key), desc. == 254 (WPA) or 2 (RSN) */

		if( h80211[z + 1] != 0x03 ||
			( h80211[z + 4] != 0xFE && h80211[z + 4] != 0x02 ) )
			continue;

		ap_cur->crypt = 3;		 /* set WPA */

		/* frame 1: Pairwise == 1, Install == 0, Ack == 1, MIC == 0 */

		if( ( h80211[z + 6] & 0x08 ) != 0 &&
			( h80211[z + 6] & 0x40 ) == 0 &&
			( h80211[z + 6] & 0x80 ) != 0 &&
			( h80211[z + 5] & 0x01 ) == 0 )
		{
			memcpy( st_cur->wpa.anonce, &h80211[z + 17], 32 );

			/* authenticator nonce set */
			st_cur->wpa.state = 1;
		}

		/* frame 2 or 4: Pairwise == 1, Install == 0, Ack == 0, MIC == 1 */

		if(( h80211[z + 6] & 0x08 ) != 0 &&
			( h80211[z + 6] & 0x40 ) == 0 &&
			( h80211[z + 6] & 0x80 ) == 0 &&
			( h80211[z + 5] & 0x01 ) != 0 )
		{
			if( memcmp( &h80211[z + 17], ZERO, 32 ) != 0 )
			{
				memcpy( st_cur->wpa.snonce, &h80211[z + 17], 32 );

								 /* supplicant nonce set */
				st_cur->wpa.state |= 2;
			}

			//if( (st_cur->wpa.state & 4) != 4 )
			//{
				/* copy the MIC & eapol frame */

				st_cur->wpa.eapol_size = ( h80211[z + 2] << 8 )
					+   h80211[z + 3] + 4;

				if ((int)pkh.len - z < st_cur->wpa.eapol_size )
					// Ignore the packet trying to crash us.
					continue;

				memcpy( st_cur->wpa.keymic, &h80211[z + 81], 16 );
				memcpy( st_cur->wpa.eapol,  &h80211[z], st_cur->wpa.eapol_size );
				memset( st_cur->wpa.eapol + 81, 0, 16 );

									/* eapol frame & keymic set */
				st_cur->wpa.state |= 4;

				/* copy the key descriptor version */

				st_cur->wpa.keyver = h80211[z + 6] & 7;
			//}
		}

		/* frame 3: Pairwise == 1, Install == 1, Ack == 1, MIC == 1 */

		if( ( h80211[z + 6] & 0x08 ) != 0 &&
			( h80211[z + 6] & 0x40 ) != 0 &&
			( h80211[z + 6] & 0x80 ) != 0 &&
			( h80211[z + 5] & 0x01 ) != 0 )
		{
			if( memcmp( &h80211[z + 17], ZERO, 32 ) != 0 )
			{
				memcpy( st_cur->wpa.anonce, &h80211[z + 17], 32 );

								 /* authenticator nonce set */
				st_cur->wpa.state |= 1;
			}

			//if( (st_cur->wpa.state & 4) != 4 )
			//{
				/* copy the MIC & eapol frame */

				st_cur->wpa.eapol_size = ( h80211[z + 2] << 8 )
					+   h80211[z + 3] + 4;

				if ((int)pkh.len - z < st_cur->wpa.eapol_size )
					continue;

				memcpy( st_cur->wpa.keymic, &h80211[z + 81], 16 );
				memcpy( st_cur->wpa.eapol,  &h80211[z], st_cur->wpa.eapol_size );
				memset( st_cur->wpa.eapol + 81, 0, 16 );

				/* eapol frame & keymic set */
				st_cur->wpa.state |= 4;

				/* copy the key descriptor version */

				st_cur->wpa.keyver = h80211[z + 6] & 7;
			//}
		}

		if( st_cur->wpa.state == 7 )
		{
			/* got one valid handshake */
			/* TODO: write this handshake only if it's quality ( how to know it ? ) is better then the previous one. */
			// use n as boolean switch: 1 => write, 0=>skip
			if(essid!=NULL) // essid filter active
				if(strncmp(essid,ap_cur->essid,33))
					n=0;
				else
					n=1;
			else
				n=1;
			if(n==1)
			{
				memcpy (&(ap_cur->wpa.essid),      &ap_cur->essid,          sizeof (ap_cur->essid));
				memcpy (&(ap_cur->wpa.mac1),       &ap_cur->bssid,          sizeof (ap_cur->bssid));
				memcpy (&(ap_cur->wpa.mac2),       &stmac,      						sizeof (st_cur->wpa.stmac));
				memcpy (&(ap_cur->wpa.nonce1),     &st_cur->wpa.snonce,     sizeof (st_cur->wpa.snonce));
				memcpy (&(ap_cur->wpa.nonce2),     &st_cur->wpa.anonce,     sizeof (st_cur->wpa.anonce));
				memcpy (&(ap_cur->wpa.eapol),      &st_cur->wpa.eapol,      sizeof (st_cur->wpa.eapol));
				memcpy (&(ap_cur->wpa.eapol_size), &st_cur->wpa.eapol_size, sizeof (st_cur->wpa.eapol_size));
				memcpy (&(ap_cur->wpa.keyver),     &st_cur->wpa.keyver,     sizeof (st_cur->wpa.keyver));
				memcpy (&(ap_cur->wpa.keymic),     &st_cur->wpa.keymic,     sizeof (st_cur->wpa.keymic));
			}
			/* reset wpa handshake completation */
			st_cur->wpa.state = 0;
		}
	}

	/* write unique handshakes to file */
	// use n as write counter.
#ifdef MAX_NETWORKS
	for(ap_cur=ap_lst,n=0;ap_cur!=NULL && n < MAX_NETWORKS;ap_cur=ap_cur->next)
#else
	for(ap_cur=ap_lst,n=0;ap_cur!=NULL;ap_cur=ap_cur->next)
#endif
		if(memcmp(&(ap_cur->wpa), ZERO, 32) != 0)
		{
			/* there is a valid handshake for this access point */
			snprintf((char *) buffer,25+33,"writing handshake for \"%s\".",ap_cur->wpa.essid);
			report_error((char *) buffer,0,0,info);

			if( (fp_hccap = fopen(dst,"ab")) == NULL)
				report_error("cannot create destination file.",0,0,error);
			else if(fwrite(&(ap_cur->wpa),sizeof(hccap_t),1,fp_hccap) != 1)
				report_error("Failed to write to file.",0,0,error);
			else
			{
				fclose(fp_hccap);
				fp_hccap = NULL;
				n++;
			}
			if(fp_hccap != NULL)
				fclose(fp_hccap);
		}

	if(n==0) // if no valid handshakes were found.
		report_error("unable to find valid handshakes.",0,0,error);

	if(rb.buf1 != NULL)
	{
		free(rb.buf1);
		rb.buf1 = NULL;
	}
	if(rb.buf2 != NULL)
	{
		free(rb.buf2);
		rb.buf2 = NULL;
	}
	if(buffer != NULL)
	{
		free(buffer);
		buffer = NULL;
	}

	return;

}

int main(int argc,char *argv[])
{
	int i,j,skip[2];
	char *opt="-e";

	if(argc < 3)
	{
		snprintf(err_buff,MAX_BUFF,"Usage:\t%s <input.pcap> [input.pcap] [input.pcap] ... <outfile>",basename(argv[0]));
		report_error(err_buff,0,0,error);
		printf(		"\n"
							"this prgram convert one or more pcap capture files into an HashCat capture one.\n"
							"the only option is '-e' for filter handshakes by essid.\n"
#ifdef MAX_NETWORKS
							"in this version the maximum number of ESSID is %d\n"
							"look at \"OPTFLAGS\" in \"Makefile\" for change or disable this.\n"
#endif
							"\n"
							"\n"
							"main developer:\n"
							"\tmassimo dragano - massimo.dragano@gmail.com\n"
							"\n"
							"NOTE:\n"
							"part of this code has been taken from \"aircrack-ng\" suite.\n"
							"i will include all legal stuff as soon as i understand what they means. :)\n"
#ifdef MAX_NETWORKS
							, MAX_NETWORKS
#endif
		);
		exit(EXIT_FAILURE);
	}

	memset(&skip,0,2);

	for(essid=NULL,i=1;i<argc&&essid==NULL;i++)
		if(!strncmp(argv[i],opt,2))
			if(strlen(argv[i]) > 2) // -eESSID
			{
				skip[0] = i;
				skip[1] = 0;
				essid=(argv[i] +2);
			}
			else // -e ESSID
			{
				skip[0] = i;
				skip[1] = i+1;
				essid=argv[i+1];
			}

	j= argc-1;
	if(skip[1] == j) // ... outfile -e ESSID
		j-=2;
	else if(skip[0] == j) // ... outfile -eESSID
		j--;

	for(i=1;i<j;i++)
		if(skip[0] != i && skip[1] != i) // if option isn't ESSID or -e
			cap2hccap(argv[i],argv[j]);

	exit(EXIT_SUCCESS);
}
