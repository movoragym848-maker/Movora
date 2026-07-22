import { pool } from './src/db/pool.js';
import bcrypt from 'bcryptjs';

async function addDemoUser() {
  try {
    const email = 'demo@movora.com';
    const password = process.env.DEMO_PASSWORD || '<DEMO_PASSWORD>';
    const phone = process.env.DEMO_PHONE || '9999999999';
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert demo user
    const result = await pool.query(
      `INSERT INTO users (name, email, phone, password_hash, role, email_verified_at, phone_verified_at, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), NOW())
       RETURNING id, email, name, role`,
      ['Aryan', email, phone, hashedPassword, 'member']
    );

    console.log('✅ Demo user created successfully!');
    console.log('Account details:');
    console.log(`  Email: ${email}`);
    console.log('  Password: (not shown)');
    console.log(`  Name: ${result.rows[0].name}`);
    console.log(`  Role: ${result.rows[0].role}`);
    
    process.exit(0);
  } catch (err) {
    if (err.code === '23505') {
      console.log('⚠️  Demo user already exists!');
      console.log('Email: demo@movora.com');
      console.log('Password: (not shown)');
    } else {
      console.error('❌ Error creating demo user:', err.message);
    }
    process.exit(1);
  }
}

addDemoUser();
