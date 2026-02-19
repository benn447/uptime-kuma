/**
 * Test script for REST API
 * Run with: node extra/test-rest-api.js
 *
 * This script:
 * 1. Creates a test API key
 * 2. Tests the health endpoint
 * 3. Tests authentication with the API key
 */

const Database = require("../server/database");
const { R } = require("redbean-node");
const APIKey = require("../server/model/api_key");
const axios = require("axios");

const API_BASE_URL = "http://localhost:3001/api/v1";

async function main() {
    console.log("=== REST API Test Script ===\n");

    try {
        // Initialize database
        console.log("1. Initializing database...");
        Database.initDataDir({});
        await Database.connect(false, true, true);
        console.log("   ✓ Database connected\n");

        // Check if migrations ran
        console.log("2. Checking if api_key table exists...");
        try {
            const tables = await R.getAll("SELECT name FROM sqlite_master WHERE type='table' AND name='api_key'");
            if (tables.length === 0) {
                console.log("   ✗ api_key table not found!");
                console.log("   Please run migrations first with: npm run setup or start the server once\n");
                process.exit(1);
            }
            console.log("   ✓ api_key table exists\n");
        } catch (error) {
            console.log("   ✗ Error checking table:", error.message);
            process.exit(1);
        }

        // Get or create admin user
        console.log("3. Getting admin user...");
        let user = await R.findOne("user", " id = 1 ");
        if (!user) {
            console.log("   ✗ No admin user found! Please set up Uptime Kuma first\n");
            process.exit(1);
        }
        console.log(`   ✓ Found user: ${user.username}\n`);

        // Create or find test API key
        console.log("4. Creating/finding test API key...");
        let testKey = await R.findOne("api_key", " name = ? ", [ "test-key" ]);

        if (!testKey) {
            testKey = await APIKey.create(user.id, "test-key");
            console.log(`   ✓ Created new API key: ${testKey.key}\n`);
        } else {
            console.log(`   ✓ Found existing API key: ${testKey.key}\n`);
        }

        const apiKey = testKey.key;

        // Close database for now
        await Database.close();

        // Test 1: Health endpoint (no auth required)
        console.log("5. Testing health endpoint (no auth)...");
        try {
            const response = await axios.get(`${API_BASE_URL}/status/health`);
            console.log(`   ✓ Status: ${response.status}`);
            console.log(`   ✓ Response:`, JSON.stringify(response.data, null, 2));
            console.log("");
        } catch (error) {
            if (error.code === "ECONNREFUSED") {
                console.log("   ✗ Connection refused - Is the server running?");
                console.log("   Start the server with: npm run dev\n");
                process.exit(1);
            }
            console.log("   ✗ Error:", error.response?.data || error.message);
            console.log("");
        }

        // Test 2: Info endpoint (no auth required)
        console.log("6. Testing info endpoint (no auth)...");
        try {
            const response = await axios.get(`${API_BASE_URL}/status/info`);
            console.log(`   ✓ Status: ${response.status}`);
            console.log(`   ✓ API Version: ${response.data.apiVersion}`);
            console.log("");
        } catch (error) {
            console.log("   ✗ Error:", error.response?.data || error.message);
            console.log("");
        }

        // Test 3: Monitors endpoint without auth (should fail)
        console.log("7. Testing monitors endpoint WITHOUT auth (should fail)...");
        try {
            const response = await axios.get(`${API_BASE_URL}/monitors`);
            console.log("   ✗ Unexpected success - auth should be required!");
            console.log("");
        } catch (error) {
            if (error.response?.status === 401) {
                console.log(`   ✓ Correctly rejected with 401 Unauthorized`);
                console.log(`   ✓ Message: ${error.response.data.msg}`);
                console.log("");
            } else {
                console.log("   ✗ Error:", error.response?.data || error.message);
                console.log("");
            }
        }

        // Test 4: Monitors endpoint WITH auth (should succeed)
        console.log("8. Testing monitors endpoint WITH auth...");
        try {
            const response = await axios.get(`${API_BASE_URL}/monitors`, {
                headers: {
                    "Authorization": `Bearer ${apiKey}`
                }
            });
            console.log(`   ✓ Status: ${response.status}`);
            console.log(`   ✓ Response:`, JSON.stringify(response.data, null, 2));
            console.log("");
        } catch (error) {
            console.log("   ✗ Error:", error.response?.data || error.message);
            console.log("");
        }

        // Test 5: Invalid API key (should fail)
        console.log("9. Testing with INVALID API key (should fail)...");
        try {
            const response = await axios.get(`${API_BASE_URL}/monitors`, {
                headers: {
                    "Authorization": "Bearer invalid-key-12345"
                }
            });
            console.log("   ✗ Unexpected success - should have been rejected!");
            console.log("");
        } catch (error) {
            if (error.response?.status === 401) {
                console.log(`   ✓ Correctly rejected with 401 Unauthorized`);
                console.log(`   ✓ Message: ${error.response.data.msg}`);
                console.log("");
            } else {
                console.log("   ✗ Error:", error.response?.data || error.message);
                console.log("");
            }
        }

        console.log("=== Test Summary ===");
        console.log("✓ All tests completed!");
        console.log(`\nYour API key for testing: ${apiKey}`);
        console.log("\nYou can use this key to test the API with curl:");
        console.log(`  curl -H "Authorization: Bearer ${apiKey}" ${API_BASE_URL}/monitors`);
        console.log("");

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
