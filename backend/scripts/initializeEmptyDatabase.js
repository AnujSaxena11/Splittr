require("dotenv").config();

const { sequelize } = require("../config/dbconfig");

async function initializeEmptyDatabase() {
  try {
    await sequelize.authenticate();
    const existingTables = await sequelize.getQueryInterface().showAllTables();
    if (existingTables.length > 0) {
      throw new Error("Refusing to initialize a non-empty database. Apply the documented incremental SQL migration instead.");
    }
    await sequelize.sync();
    console.log("Initial schema created for an empty database.");
  } finally {
    await sequelize.close();
  }
}

initializeEmptyDatabase().catch((error) => {
  console.error("Database initialization failed:", error.message);
  process.exitCode = 1;
});
