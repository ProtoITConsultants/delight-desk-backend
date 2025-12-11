import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { agents } from '../schema/agent.schema';

import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const db = drizzle(pool);

async function seedAgents() {
  const agentSeeds = [
    {
      id: '4b4c5ab5-5d8a-4d8b-a032-6c8e72b8c591',
      name: 'WISMO Agent',
      type: 'wismo',
      description: 'Where Is My Order - Automate order status and shipping inquiries',
      icon: null,
    },
    {
      id: 'b1888bb6-2050-4cfa-95ce-4c327e05b74f',
      name: 'Subscription Agent',
      type: 'subscription',
      description: 'Automate billing, plan changes, and subscription inquiries',
      icon: null,
    },
    {
      id: 'f1ccf422-c7bc-4fd7-93c0-3d7e5d2b613a',
      name: 'Product Agent',
      type: 'product',
      description: 'Automate responses to product questions and brand inquiries.',
      icon: null,
    },
    {
      id: '678e4149-563a-4da1-9dcc-9d0e98d8f614',
      name: 'Returns Agent',
      type: 'returns',
      description:
        'Automate return and refund processing based on your business policies. Handle simple auto-approvals or complex eligibility evaluations.',
      icon: null,
    },
    {
      id: 'c57a276a-c93e-4b1f-95b1-0664ad85f439',
      name: 'Promo Code Agent',
      type: 'promo_code',
      description:
        'Automatically handle promo code refunds AND offer first-time customer discounts. Configure when and how to provide discounts to new customers and general inquiries, plus process refunds for missed promo codes.',
      icon: null,
    },
    {
      id: 'ef696020-0ff4-4e51-a32c-3eca76d1a912',
      name: 'Address Change Agent',
      type: 'address_change',
      description: 'Automate and monitor address change workflows.',
      icon: null,
    },
    {
      id: '8dcf7e93-8a70-4bba-b231-1e54cc7b3a76',
      name: 'Order Cancellation Agent',
      type: 'order_cancellation',
      description: 'Automate and monitor order cancellation workflows.',
      icon: null,
    },
  ];

  await db.insert(agents).values(agentSeeds).onConflictDoNothing({ target: agents.id });

  console.log('Agents seeded!');
  process.exit(0);
}

seedAgents().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
