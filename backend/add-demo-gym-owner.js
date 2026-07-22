import { pool } from './src/db/pool.js';
import bcrypt from 'bcryptjs';

async function addDemoGymOwner() {
  try {
    const email = 'gymowner@movora.com';
    const password = process.env.DEMO_PASSWORD || '<DEMO_PASSWORD>'; // Set via env to avoid committing secrets
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert demo gym owner
    const result = await pool.query(
      `INSERT INTO gym_owners (gym_name, city, email, phone, password_hash, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING id, email, gym_name, status`,
      ['RS Alpha Gym', 'Mumbai', email, '9876543210', hashedPassword, 'active']
    );

    console.log('✅ Demo gym owner created successfully!');
    console.log('Account details:');
    console.log(`  Email: ${email}`);
    console.log('  Password: (not shown)');
    console.log(`  Gym: ${result.rows[0].gym_name}`);
    console.log(`  Status: ${result.rows[0].status}`);
    
    process.exit(0);
  } catch (err) {
    if (err.code === '23505') {
      console.log('⚠️  Demo gym owner already exists!');
      console.log('Email: gymowner@movora.com');
      console.log('Password: demo123456');
    } else {
      console.error('❌ Error creating demo gym owner:', err.message);
    }
    process.exit(1);
  }
}

addDemoGymOwner();
