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

  await db.insert(billingPlans).values(plans).onConflictDoNothing();
  console.log('Billing plans seeded!');
  process.exit(0);
}

seedBillingPlans().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
