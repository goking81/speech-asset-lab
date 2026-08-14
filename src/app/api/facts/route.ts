import { NextResponse } from 'next/server';
import { createDatabaseClient } from '@/server/db/client';

export async function GET() {
  const prisma = createDatabaseClient();
  try {
    return NextResponse.json({
      facts: await prisma.userFact.findMany({
        where: { userId: 'local-user' },
        orderBy: { createdAt: 'desc' },
      }),
    });
  } finally {
    await prisma.$disconnect();
  }
}
export async function POST(request: Request) {
  const prisma = createDatabaseClient();
  try {
    const body = (await request.json()) as {
      text?: string;
      action?: 'CREATE' | 'CONFIRM';
      id?: string;
    };
    if (body.action === 'CONFIRM' && body.id)
      return NextResponse.json({
        fact: await prisma.userFact.update({
          where: { id: body.id },
          data: { status: 'CONFIRMED' },
        }),
      });
    if (!body.text?.trim())
      return NextResponse.json({ error: '事实内容不能为空。' }, { status: 400 });
    return NextResponse.json({
      fact: await prisma.userFact.create({
        data: { userId: 'local-user', text: body.text.trim() },
      }),
    });
  } finally {
    await prisma.$disconnect();
  }
}
