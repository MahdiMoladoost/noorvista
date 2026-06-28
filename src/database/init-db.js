// src/database/init-db.js
// Compatibility wrapper for the old npm run init-db script.
const { main } = require('./init_db');

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
