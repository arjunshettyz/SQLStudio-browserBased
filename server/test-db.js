const { Client } = require('pg');

const initDB = async () => {
  const maintenanceClient = new Client({
    user: 'postgres',
    password: 'postgres',
    host: 'localhost',
    port: 5432,
    database: 'postgres'
  });

  try {
    console.log('Connecting to PostgreSQL...');
    await maintenanceClient.connect();
    console.log('✓ Connected to PostgreSQL');

    // Check if ciphersql database exists
    const result = await maintenanceClient.query(
      "SELECT 1 FROM pg_database WHERE datname = 'ciphersql'"
    );

    if (result.rows.length === 0) {
      console.log('Creating ciphersql database...');
      await maintenanceClient.query('CREATE DATABASE ciphersql');
      console.log('✓ Database created');
    } else {
      console.log('✓ Database already exists');
    }

    await maintenanceClient.end();
    console.log('✓ Initialization complete');
  } catch (err) {
    console.log('✗ Error:', err.message);
    process.exit(1);
  }
};

initDB();
