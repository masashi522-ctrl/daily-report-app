import { PrismaClient } from '../generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import bcrypt from 'bcryptjs'

const adapter = new PrismaBetterSqlite3({ url: 'file:./dev.db' })
const prisma = new PrismaClient({ adapter })

async function main() {
  const adminPassword = await bcrypt.hash('admin1234', 10)
  const leaderPassword = await bcrypt.hash('leader1234', 10)

  await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      name: '管理者',
      email: 'admin@example.com',
      password: adminPassword,
      role: 'admin',
    },
  })

  await prisma.user.upsert({
    where: { email: 'leader@example.com' },
    update: {},
    create: {
      name: 'リーダー',
      email: 'leader@example.com',
      password: leaderPassword,
      role: 'leader',
    },
  })

  console.log('Seed complete.')
  console.log('  admin@example.com  / admin1234')
  console.log('  leader@example.com / leader1234')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
