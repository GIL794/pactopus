import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const demoInvoices = [
  // --- Arc (EVM) Invoices ---
  {
    id: 'arc-001',
    amount: '1500.00',
    currency: 'USDC',
    description: 'Brand Strategy Consulting — Q3 2025',
    recipientAddress: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
    recipientName: 'Kyrvyn Studio',
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    status: 'paid',
    txHash: '0xabc123def456abc123def456abc123def456abc123def456abc123def456abc1',
    paidAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
    paidBy: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    fee: '7.50',
    network: 'arc',
  },
  {
    id: 'arc-002',
    amount: '850.00',
    currency: 'EURC',
    description: 'Website Design — Homepage Redesign',
    recipientAddress: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
    recipientName: 'Kyrvyn Studio',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    status: 'paid',
    txHash: '0xdef456abc123def456abc123def456abc123def456abc123def456abc123def4',
    paidAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    paidBy: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    fee: '4.25',
    network: 'arc',
  },
  {
    id: 'arc-003',
    amount: '2200.00',
    currency: 'USDC',
    description: 'Monthly Retainer — Product Advisory',
    recipientAddress: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
    recipientName: 'Kyrvyn Studio',
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    status: 'pending',
    network: 'arc',
  },

  // --- Algorand Invoices ---
  {
    id: 'algo-001',
    amount: '3200.00',
    currency: 'USDC',
    description: 'Solidity to TEAL Port — smart contract audit',
    recipientAddress: 'J32G7FGD4S6A3R2R5H7P7KP7N5L2G5F4F5E6D7C8B9A1Z2Y3X4W5V6U7TS',
    recipientName: 'Kyrvyn Studio',
    createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    status: 'paid',
    txHash: 'T2G7FGD4S6A3R2R5H7P7KP7N5L2G5F4F5E6D7C8B9A1Z2Y3X4W5V6U7T8S1A2B3C',
    paidAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    paidBy: 'P2R5H7P7KP7N5L2G5F4F5E6D7C8B9A1Z2Y3X4W5V6U7T8S1A2B3C4D5E6F7G8H9',
    fee: '16.00',
    network: 'algorand',
  },
  {
    id: 'algo-002',
    amount: '1250.00',
    currency: 'USDC',
    description: 'dApp Frontend Deployment on Algorand',
    recipientAddress: 'J32G7FGD4S6A3R2R5H7P7KP7N5L2G5F4F5E6D7C8B9A1Z2Y3X4W5V6U7TS',
    recipientName: 'Kyrvyn Studio',
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    status: 'pending',
    network: 'algorand',
  },
];

async function main() {
  console.log('Seeding initial invoices into Neon PostgreSQL database...');
  for (const inv of demoInvoices) {
    await prisma.invoice.upsert({
      where: { id: inv.id },
      update: {},
      create: inv,
    });
  }
  console.log('✓ Successfully seeded demo invoices into Neon!');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
