// scripts/init_db.js
const { main } = require('../src/database/init_db');

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
