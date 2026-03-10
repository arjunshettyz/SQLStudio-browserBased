const mongoose = require('mongoose');
const { getClient } = require('./src/db');

async function test() {
  require('dotenv').config();
  try {
    const client = await getClient();
    try {
      const res = await client.query('SELCT * FROM bogus;');
      console.log(res);
    } catch(e) {
      console.error("Query Error", e);
    }
    client.release();
    process.exit(0);
  } catch (e) {
    console.error("Connect Error", e);
    process.exit(1);
  }
}
test();
