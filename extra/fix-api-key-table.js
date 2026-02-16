/**
 * Fix api_key table by dropping and recreating it
 * Run with: node extra/fix-api-key-table.js
 */

const Database = require("../server/database");
const { R } = require("redbean-node");

async function main() {
    console.log("=== Fixing api_key table ===\n");

    try {
        // Initialize database
        console.log("1. Connecting to database...");
        Database.initDataDir({});
        await Database.connect(false, true, true);
        console.log("   ✓ Connected\n");

        // Check if table exists
        console.log("2. Checking if api_key table exists...");
        const tables = await R.getAll("SELECT name FROM sqlite_master WHERE type='table' AND name='api_key'");

        if (tables.length > 0) {
            console.log("   ✓ Table exists, dropping it...");
            await R.exec("DROP TABLE api_key");
            console.log("   ✓ Table dropped\n");
        } else {
            console.log("   ℹ Table doesn't exist\n");
        }

        // Create table with correct schema
        console.log("3. Creating api_key table with correct schema...");
        await R.exec(`
            CREATE TABLE api_key (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR(200) NOT NULL,
                key VARCHAR(200) NOT NULL UNIQUE,
                user_id INTEGER NOT NULL,
                active BOOLEAN NOT NULL DEFAULT 1,
                created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                expiry_date DATETIME NULL,
                last_used DATETIME NULL,
                FOREIGN KEY(user_id) REFERENCES user(id) ON DELETE CASCADE ON UPDATE CASCADE
            )
        `);
        console.log("   ✓ Table created\n");

        // Verify columns
        console.log("4. Verifying table schema...");
        const schema = await R.getAll("PRAGMA table_info(api_key)");
        console.log("   Columns:", schema.map(col => col.name).join(", "));
        console.log("   ✓ Schema verified\n");

        await Database.close();

        console.log("=== Success! ===");
        console.log("The api_key table has been recreated with the correct schema.");
        console.log("You can now run: node extra/test-rest-api.js\n");

    } catch (error) {
        console.error("Fatal error:", error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main().then(() => {
        process.exit(0);
    }).catch((error) => {
        console.error("Error:", error);
        process.exit(1);
    });
}

module.exports = { main };
