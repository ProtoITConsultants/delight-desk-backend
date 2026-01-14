import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { billingPlans } from '../schema/billing_plan.schema';

import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

const db = drizzle(pool);

async function seedBillingPlans() {
  const plans = [
    {
      id: 'a0c77ed0-6c9d-4f8c-9c71-5c26a9da1ba2',
      name: 'growth',
      displayName: 'Growth',
      price: '45.00',
      costPerResolution: '0.75',
      emailLimit: null,
      features: [
        'Unlimited access to AI Assistant',
        'Full Platform Access Included',
        'AI automations and Quick Actions',
        'Support: Priority Email + Phone',
      ],
      resolutions: 40,
    },
    {
      id: 'b79c5a14-093b-4cd2-86ce-8f5181e4476e',
      name: 'solopreneur',
      displayName: 'Solopreneur',
      price: '9.00',
      costPerResolution: '0.80',
      emailLimit: null,
      features: [
        'Unlimited access to AI Assistant',
        'Full Platform Access Included',
        'AI automations and Quick Actions',
        'Support: Email',
      ],
      resolutions: 10,
    },
    {
      id: 'f110ad73-19d3-4b7d-8c6e-3199a91734e8',
      name: 'scale',
      displayName: 'Scale',
      price: '80.00',
      costPerResolution: '0.70',
      emailLimit: null,
      features: [
        'Unlimited access to AI Assistant',
        'Full Platform Access Included',
        'AI automations and Quick Actions',
        'Support: Priority Email + Phone + Slack',
      ],
      resolutions: 100,
    },
  ];

  await db.insert(billingPlans).values(plans).onConflictDoNothing({ target: billingPlans.id });
  console.log('Billing plans seeded!');
  process.exit(0);
}

seedBillingPlans().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
