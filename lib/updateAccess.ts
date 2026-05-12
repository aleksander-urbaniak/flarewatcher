import type { Prisma } from "@prisma/client/index";

import { prisma } from "@/lib/prisma";

export async function getUserDnsUpdateWhere(
  userId: string,
  email: string
): Promise<Prisma.DnsUpdateWhereInput> {
  const tokens = await prisma.cloudflareToken.findMany({
    where: { userId },
    select: { id: true },
  });
  const tokenIds = tokens.map((token) => token.id);

  if (tokenIds.length === 0) {
    return { actor: email };
  }

  return {
    OR: [{ actor: email }, { tokenId: { in: tokenIds } }],
  };
}
