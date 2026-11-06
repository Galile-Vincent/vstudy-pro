/** Read peer UID from inherited fd 3 without consuming any bridge protocol bytes. */
#define _GNU_SOURCE
#define _DARWIN_C_SOURCE
#include <sys/types.h>
#include <sys/socket.h>
#include <unistd.h>
#include <inttypes.h>
#include <stdio.h>

int main(void) {
  uid_t uid;
#if defined(__APPLE__)
  gid_t gid;
  if (getpeereid(3, &uid, &gid) != 0) return 1;
#elif defined(__linux__)
  struct ucred peer;
  socklen_t length = sizeof(peer);
  if (getsockopt(3, SOL_SOCKET, SO_PEERCRED, &peer, &length) != 0 || length != sizeof(peer)) return 1;
  uid = peer.uid;
#else
  return 1;
#endif
  return printf("%ju\n", (uintmax_t)uid) < 0 ? 1 : 0;
}
