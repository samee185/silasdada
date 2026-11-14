import '../env';
/**
 * Creates (or resets) a login from the command line.
 *   npm run create-admin
 * Asks for name, email, password and role (owner or secretary).
 */
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import bcrypt from 'bcryptjs';
import { prisma } from '../db';

async function main() {
  const rl = readline.createInterface({ input, output });
  const name = (await rl.question('Full name (e.g. Rev\'d Silas O. Dada): ')).trim();
  const email = (await rl.question('Email: ')).trim().toLowerCase();
  const password = await rl.question('Password (at least 10 characters): ');
  const roleAnswer = (await rl.question('Role — owner or secretary [owner]: ')).trim().toLowerCase();
  rl.close();

  if (!name || !email.includes('@') || password.length < 10) {
    console.error('✖ Name, a valid email and a 10+ character password are required.');
    process.exit(1);
  }
  const role = roleAnswer === 'secretary' ? 'SECRETARY' : 'OWNER';
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: { name, passwordHash, role },
    create: { name, email, passwordHash, role },
  });
  console.log(`✔ ${role === 'OWNER' ? 'Owner' : 'Secretary'} account ready for ${user.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
