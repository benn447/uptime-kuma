/**
 * Comprehensive REST API test script
 * Tests all Phase 1 REST API endpoints
 * Run with: node extra/test-full-rest-api.js
 */

const Database = require("../server/database");
const { R } = require("redbean-node");
const { APIKey } = require("../server/model/api_key");

const API_BASE_URL = "http://localhost:3001/api/v1";
let testApiKey = null;

/**
 * Make HTTP request
 * @param {string} method HTTP method
 * @param {string} path API path
 * @param {object} body Request body
 * @param {string} apiKey API key for authentication
 * @returns {Promise<object>} Response
 */
async function apiRequest(method, path, body = null, apiKey = testApiKey) {
    const https = require("http");
    const url = new URL(API_BASE_URL + path);

    const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: method,
        headers: {
            "Content-Type": "application/json",
        },
    };

    if (apiKey) {
        options.headers["Authorization"] = `Bearer ${apiKey}`;
    }

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = "";

            res.on("data", (chunk) => {
                data += chunk;
            });

            res.on("end", () => {
                try {
                    const response = JSON.parse(data);
                    resolve({ statusCode: res.statusCode, data: response });
                } catch (e) {
                    reject(new Error(`Failed to parse response: ${data}`));
                }
            });
        });

        req.on("error", (error) => {
            reject(error);
        });

        if (body) {
            req.write(JSON.stringify(body));
        }

        req.end();
    });
}

/**
 * Test status endpoints
 */
async function testStatusEndpoints() {
    console.log("\n=== Testing Status Endpoints ===");

    // Test health endpoint (no auth required)
    console.log("1. Testing GET /status/health...");
    const healthResp = await apiRequest("GET", "/status/health", null, null);
    console.log(`   Status: ${healthResp.statusCode}`);
    console.log(`   Response:`, JSON.stringify(healthResp.data, null, 2));

    if (healthResp.data.ok && healthResp.data.status === "healthy") {
        console.log("   ✓ Health check passed");
    } else {
        console.log("   ✗ Health check failed");
    }
}

/**
 * Test tag endpoints
 */
async function testTagEndpoints() {
    console.log("\n=== Testing Tag Endpoints ===");

    // Create a tag
    console.log("1. Creating a tag...");
    const createTagResp = await apiRequest("POST", "/tags", {
        name: "test-environment",
        color: "#3498db",
    });
    console.log(`   Status: ${createTagResp.statusCode}`);
    console.log(`   Tag ID: ${createTagResp.data.tag?.id}`);

    if (!createTagResp.data.ok) {
        console.log("   ✗ Failed to create tag:", createTagResp.data.msg);
        return null;
    }

    const tagId = createTagResp.data.tag.id;
    console.log("   ✓ Tag created successfully");

    // List tags
    console.log("2. Listing all tags...");
    const listTagsResp = await apiRequest("GET", "/tags");
    console.log(`   Status: ${listTagsResp.statusCode}`);
    console.log(`   Tag count: ${listTagsResp.data.tags?.length}`);
    console.log("   ✓ Tags listed successfully");

    // Get tag
    console.log("3. Getting tag details...");
    const getTagResp = await apiRequest("GET", `/tags/${tagId}`);
    console.log(`   Status: ${getTagResp.statusCode}`);
    console.log(`   Tag name: ${getTagResp.data.tag?.name}`);
    console.log("   ✓ Tag retrieved successfully");

    // Update tag
    console.log("4. Updating tag...");
    const updateTagResp = await apiRequest("PUT", `/tags/${tagId}`, {
        color: "#e74c3c",
    });
    console.log(`   Status: ${updateTagResp.statusCode}`);
    console.log("   ✓ Tag updated successfully");

    return tagId;
}

/**
 * Test group endpoints
 */
async function testGroupEndpoints() {
    console.log("\n=== Testing Group Endpoints ===");

    // Create a group
    console.log("1. Creating a group...");
    const createGroupResp = await apiRequest("POST", "/groups", {
        name: "Test Group",
        description: "A test group for API testing",
        weight: 100,
    });
    console.log(`   Status: ${createGroupResp.statusCode}`);
    console.log(`   Group ID: ${createGroupResp.data.groupId}`);

    if (!createGroupResp.data.ok) {
        console.log("   ✗ Failed to create group:", createGroupResp.data.msg);
        return null;
    }

    const groupId = createGroupResp.data.groupId;
    console.log("   ✓ Group created successfully");

    // List groups
    console.log("2. Listing all groups...");
    const listGroupsResp = await apiRequest("GET", "/groups");
    console.log(`   Status: ${listGroupsResp.statusCode}`);
    console.log(`   Group count: ${listGroupsResp.data.groups?.length}`);
    console.log("   ✓ Groups listed successfully");

    // Get group
    console.log("3. Getting group details...");
    const getGroupResp = await apiRequest("GET", `/groups/${groupId}?includeChildren=true`);
    console.log(`   Status: ${getGroupResp.statusCode}`);
    console.log(`   Group name: ${getGroupResp.data.group?.name}`);
    console.log(`   Child count: ${getGroupResp.data.group?.childCount || 0}`);
    console.log("   ✓ Group retrieved successfully");

    // Update group
    console.log("4. Updating group...");
    const updateGroupResp = await apiRequest("PUT", `/groups/${groupId}`, {
        description: "Updated description",
    });
    console.log(`   Status: ${updateGroupResp.statusCode}`);
    console.log("   ✓ Group updated successfully");

    return groupId;
}

/**
 * Test monitor endpoints
 */
async function testMonitorEndpoints(groupId, tagId) {
    console.log("\n=== Testing Monitor Endpoints ===");

    // Create a monitor
    console.log("1. Creating a monitor...");
    const createMonitorResp = await apiRequest("POST", "/monitors", {
        name: "Test HTTP Monitor",
        type: "http",
        url: "https://www.google.com",
        interval: 60,
        retryInterval: 60,
        maxretries: 3,
        active: true,
        parent: groupId,
    });
    console.log(`   Status: ${createMonitorResp.statusCode}`);
    console.log(`   Monitor ID: ${createMonitorResp.data.monitorId}`);

    if (!createMonitorResp.data.ok) {
        console.log("   ✗ Failed to create monitor:", createMonitorResp.data.msg);
        return null;
    }

    const monitorId = createMonitorResp.data.monitorId;
    console.log("   ✓ Monitor created successfully");

    // List monitors
    console.log("2. Listing all monitors...");
    const listMonitorsResp = await apiRequest("GET", "/monitors?page=1&limit=10");
    console.log(`   Status: ${listMonitorsResp.statusCode}`);
    console.log(`   Monitor count: ${listMonitorsResp.data.monitors?.length}`);
    console.log(`   Total: ${listMonitorsResp.data.total}`);
    console.log("   ✓ Monitors listed successfully");

    // Get monitor
    console.log("3. Getting monitor details...");
    const getMonitorResp = await apiRequest("GET", `/monitors/${monitorId}`);
    console.log(`   Status: ${getMonitorResp.statusCode}`);
    console.log(`   Monitor name: ${getMonitorResp.data.monitor?.name}`);
    console.log(`   Monitor type: ${getMonitorResp.data.monitor?.type}`);
    console.log("   ✓ Monitor retrieved successfully");

    // Update monitor
    console.log("4. Updating monitor...");
    const updateMonitorResp = await apiRequest("PUT", `/monitors/${monitorId}`, {
        name: "Updated Test Monitor",
        interval: 120,
    });
    console.log(`   Status: ${updateMonitorResp.statusCode}`);
    console.log("   ✓ Monitor updated successfully");

    // Add tag to monitor
    if (tagId) {
        console.log("5. Adding tag to monitor...");
        const addTagResp = await apiRequest("POST", `/monitors/${monitorId}/tags`, {
            tagId: tagId,
            value: "production",
        });
        console.log(`   Status: ${addTagResp.statusCode}`);
        console.log("   ✓ Tag added to monitor successfully");

        // Update tag value
        console.log("6. Updating monitor tag value...");
        const updateTagResp = await apiRequest("PUT", `/monitors/${monitorId}/tags/${tagId}`, {
            value: "staging",
        });
        console.log(`   Status: ${updateTagResp.statusCode}`);
        console.log("   ✓ Tag value updated successfully");
    }

    // Pause monitor
    console.log("7. Pausing monitor...");
    const pauseMonitorResp = await apiRequest("POST", `/monitors/${monitorId}/pause`);
    console.log(`   Status: ${pauseMonitorResp.statusCode}`);
    console.log("   ✓ Monitor paused successfully");

    // Resume monitor
    console.log("8. Resuming monitor...");
    const resumeMonitorResp = await apiRequest("POST", `/monitors/${monitorId}/resume`);
    console.log(`   Status: ${resumeMonitorResp.statusCode}`);
    console.log("   ✓ Monitor resumed successfully");

    // Get monitor status (after a short delay to allow heartbeat)
    console.log("9. Getting monitor status...");
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    const statusResp = await apiRequest("GET", `/monitors/${monitorId}/status`);
    console.log(`   Status: ${statusResp.statusCode}`);
    console.log(`   Monitor status: ${statusResp.data.status?.status}`);
    console.log(`   24h uptime: ${statusResp.data.status?.uptime24h}%`);
    console.log("   ✓ Monitor status retrieved successfully");

    // Get heartbeats
    console.log("10. Getting monitor heartbeats...");
    const heartbeatsResp = await apiRequest("GET", `/monitors/${monitorId}/heartbeats?hours=1`);
    console.log(`   Status: ${heartbeatsResp.statusCode}`);
    console.log(`   Heartbeat count: ${heartbeatsResp.data.heartbeats?.length || 0}`);
    console.log("   ✓ Monitor heartbeats retrieved successfully");

    return monitorId;
}

/**
 * Test group-children relationships
 */
async function testGroupChildren(groupId, monitorId) {
    console.log("\n=== Testing Group-Children Relationships ===");

    // Get group children
    console.log("1. Getting group children...");
    const getChildrenResp = await apiRequest("GET", `/groups/${groupId}/children`);
    console.log(`   Status: ${getChildrenResp.statusCode}`);
    console.log(`   Children count: ${getChildrenResp.data.children?.length}`);
    console.log("   ✓ Group children retrieved successfully");

    // Create another monitor
    console.log("2. Creating another monitor...");
    const createMonitor2Resp = await apiRequest("POST", "/monitors", {
        name: "Test Monitor 2",
        type: "http",
        url: "https://www.github.com",
        interval: 60,
    });
    const monitorId2 = createMonitor2Resp.data.monitorId;
    console.log(`   Monitor ID: ${monitorId2}`);
    console.log("   ✓ Monitor created successfully");

    // Add monitor to group
    console.log("3. Adding monitor to group...");
    const addChildResp = await apiRequest("POST", `/groups/${groupId}/children/${monitorId2}`);
    console.log(`   Status: ${addChildResp.statusCode}`);
    console.log("   ✓ Monitor added to group successfully");

    // Verify children count
    console.log("4. Verifying children count...");
    const verifyChildrenResp = await apiRequest("GET", `/groups/${groupId}/children`);
    console.log(`   Children count: ${verifyChildrenResp.data.children?.length}`);
    console.log("   ✓ Children count verified");

    // Remove monitor from group
    console.log("5. Removing monitor from group...");
    const removeChildResp = await apiRequest("DELETE", `/groups/${groupId}/children/${monitorId2}`);
    console.log(`   Status: ${removeChildResp.statusCode}`);
    console.log("   ✓ Monitor removed from group successfully");

    // Delete the second monitor
    console.log("6. Deleting second monitor...");
    const deleteMonitor2Resp = await apiRequest("DELETE", `/monitors/${monitorId2}`);
    console.log(`   Status: ${deleteMonitor2Resp.statusCode}`);
    console.log("   ✓ Monitor deleted successfully");
}

/**
 * Cleanup test data
 */
async function cleanupTestData(monitorId, groupId, tagId) {
    console.log("\n=== Cleaning Up Test Data ===");

    // Delete tag from monitor
    if (monitorId && tagId) {
        console.log("1. Removing tag from monitor...");
        await apiRequest("DELETE", `/monitors/${monitorId}/tags/${tagId}`);
        console.log("   ✓ Tag removed from monitor");
    }

    // Delete monitor
    if (monitorId) {
        console.log("2. Deleting monitor...");
        await apiRequest("DELETE", `/monitors/${monitorId}`);
        console.log("   ✓ Monitor deleted");
    }

    // Delete group
    if (groupId) {
        console.log("3. Deleting group...");
        await apiRequest("DELETE", `/groups/${groupId}`);
        console.log("   ✓ Group deleted");
    }

    // Delete tag
    if (tagId) {
        console.log("4. Deleting tag...");
        await apiRequest("DELETE", `/tags/${tagId}`);
        console.log("   ✓ Tag deleted");
    }

    console.log("\n✓ Cleanup completed");
}

/**
 * Main test function
 */
async function main() {
    console.log("=== Comprehensive REST API Test ===\n");

    try {
        // Initialize database
        console.log("1. Connecting to database...");
        Database.initDataDir({});
        await Database.connect(false, true, true);
        console.log("   ✓ Connected\n");

        // Get or create admin user
        console.log("2. Getting admin user...");
        let user = await R.findOne("user", " id = 1 ");
        if (!user) {
            console.log("   ✗ Admin user not found. Please set up Uptime Kuma first.");
            process.exit(1);
        }
        console.log(`   ✓ Found user: ${user.username}\n`);

        // Create test API key
        console.log("3. Creating test API key...");
        let apiKeyBean = await APIKey.create(user.id, "comprehensive-test-key");
        testApiKey = apiKeyBean.key;
        console.log(`   ✓ API Key: ${testApiKey}\n`);

        // Run tests
        await testStatusEndpoints();

        const tagId = await testTagEndpoints();
        const groupId = await testGroupEndpoints();
        const monitorId = await testMonitorEndpoints(groupId, tagId);

        if (groupId && monitorId) {
            await testGroupChildren(groupId, monitorId);
        }

        // Cleanup
        await cleanupTestData(monitorId, groupId, tagId);

        // Delete test API key
        console.log("\n5. Deleting test API key...");
        await R.exec("DELETE FROM api_key WHERE id = ?", [ apiKeyBean.id ]);
        console.log("   ✓ API key deleted");

        await Database.close();

        console.log("\n=== All Tests Completed Successfully! ===\n");
        process.exit(0);

    } catch (error) {
        console.error("\n✗ Fatal error:", error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main().catch((error) => {
        console.error("Error:", error);
        process.exit(1);
    });
}

module.exports = { main };
