// One-off seed: create BP's admin User on the default Organization.
//
// Usage:
//   node scripts/seed-admin.js --email you@example.com
//   node scripts/seed-admin.js --email you@example.com --password 'your-pw'
//
// If --password is omitted, a strong random password is generated and printed
// once at the end (copy it immediately — it is not stored anywhere).
//
// Run AFTER the organization-model migration has been applied. Idempotent:
// running it again for the same email reports that the user already exists.

require('dotenv').config();

const crypto = require('crypto');
const prisma = require('../src/utils/prisma');
const { hashPassword } = require('../src/utils/password');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--email') out.email = args[++i];
    else if (args[i] === '--password') out.password = args[++i];
    else if (args[i] === '--org') out.orgId = args[++i];
  }
  return out;
}

function generatePassword() {
  return crypto.randomBytes(24).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 20) + '!A1';
}

async function main() {
  const { email, password: suppliedPassword, orgId } = parseArgs();

  if (!email || !email.includes('@')) {
    console.error('Usage: node scripts/seed-admin.js --email you@example.com [--password pw] [--org orgId]');
    process.exit(1);
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Determine the target org: explicit --org, else the default org, else the
  // first org in the table.
  let org;
  if (orgId) {
    org = await prisma.organization.findUnique({ where: { id: orgId } });
  } else {
    org = await prisma.organization.findFirst({ where: { id: 'org_bp_default' } })
      || await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
  }

  if (!org) {
    console.error('No Organization found. Run the migration first.');
    process.exit(1);
  }

  // Idempotency: don't create a second user for the same email.
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    console.log(`User ${normalizedEmail} already exists (org: ${existing.organizationId}). No changes made.`);
    process.exit(0);
  }

  const password = suppliedPassword || generatePassword();
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: { email: normalizedEmail, passwordHash, organizationId: org.id },
  });

  console.log('Admin user created:');
  console.log(`  email:    ${user.email}`);
  console.log(`  userId:   ${user.id}`);
  console.log(`  org:      ${org.name} (${org.id})`);
  if (!suppliedPassword) {
    console.log(`  password: ${password}`);
    console.log('  (no --password supplied — the above random password was used; copy it now)');
  }
  console.log('\nYou can now log in at /api/auth/login with this email + password.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
