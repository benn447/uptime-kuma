const { BeanModel } = require("redbean-node/dist/bean-model");
const { R } = require("redbean-node");
const dayjs = require("dayjs");
const { generateAPIKey } = require("../util-server");

class APIKey extends BeanModel {
    /**
     * Return an object that ready to parse to JSON
     * @returns {Promise<object>} Object ready to parse
     */
    async toJSON() {
        return {
            id: this.id,
            name: this.name,
            key: this.key,
            userId: this.user_id,
            active: !!this.active,
            createdDate: this.created_date,
            expires: this.expires,
            lastUsed: this.last_used,
        };
    }

    /**
     * Return an object that ready to parse to JSON (without the key value)
     * @returns {Promise<object>} Object ready to parse
     */
    async toPublicJSON() {
        return {
            id: this.id,
            name: this.name,
            active: !!this.active,
            createdDate: this.created_date,
            expires: this.expires,
            lastUsed: this.last_used,
        };
    }

    /**
     * Save an API key (used by socket handler)
     * @param {Object} key - API key object with properties
     * @param {number} userID - User ID
     * @returns {Promise<APIKey>} Saved API key bean
     */
    static async save(key, userID) {
        let bean = R.dispense("api_key");
        bean.key = key.key;
        bean.name = key.name;
        bean.user_id = userID;
        bean.active = key.active !== undefined ? key.active : true;
        bean.expires = key.expires || null;
        await R.store(bean);
        return bean;
    }

    /**
     * Create a new API key
     * @param {number} userId - User ID
     * @param {string} name - Name for the API key
     * @param {Date|null} expires - Optional expiry date
     * @returns {Promise<APIKey>} Created API key
     */
    static async create(userId, name, expires = null) {
        const bean = R.dispense("api_key");
        bean.user_id = userId;
        bean.name = name;
        bean.key = generateAPIKey();
        bean.active = true;
        bean.expires = expires;
        await R.store(bean);
        return bean;
    }

    /**
     * Find an API key by its key value and verify the hash
     * Key format: uk{id}_{clearKey}
     * @param {string} key - API key in format uk{id}_{clearKey}
     * @returns {Promise<APIKey|null>} API key or null
     */
    static async findByKey(key) {
        const passwordHash = require("../password-hash");

        // Parse the key format: uk{id}_{clearKey}
        if (!key || !key.startsWith("uk")) {
            return null;
        }

        // Split on first underscore only (clearKey might contain underscores)
        const keyWithoutPrefix = key.substring(2); // Remove "uk"
        const firstUnderscoreIndex = keyWithoutPrefix.indexOf("_");

        if (firstUnderscoreIndex === -1) {
            return null;
        }

        const idStr = keyWithoutPrefix.substring(0, firstUnderscoreIndex);
        const clearKey = keyWithoutPrefix.substring(firstUnderscoreIndex + 1);
        const id = parseInt(idStr, 10);

        if (isNaN(id)) {
            return null;
        }

        // Load the API key bean
        const bean = await R.load("api_key", id);
        if (!bean || !bean.id) {
            return null;
        }

        // Verify the hash
        const valid = await passwordHash.verify(clearKey, bean.key);
        if (!valid) {
            return null;
        }

        // Check if active
        if (!bean.active) {
            return null;
        }

        return bean;
    }

    /**
     * Find all API keys for a user
     * @param {number} userId - User ID
     * @returns {Promise<APIKey[]>} List of API keys
     */
    static async findByUser(userId) {
        return await R.find("api_key", " user_id = ? ORDER BY created_date DESC ", [ userId ]);
    }

    /**
     * Check if the key is expired
     * @returns {boolean} True if expired
     */
    isExpired() {
        if (!this.expires) {
            return false;
        }
        return dayjs().isAfter(dayjs(this.expires));
    }

    /**
     * Check if the key is valid (active and not expired)
     * @returns {boolean} True if valid
     */
    isValid() {
        return this.active && !this.isExpired();
    }

    /**
     * Update last used timestamp
     * @returns {Promise<void>}
     */
    async updateLastUsed() {
        this.last_used = R.isoDateTime();
        await R.store(this);
    }

    /**
     * Deactivate the API key
     * @returns {Promise<void>}
     */
    async deactivate() {
        this.active = false;
        await R.store(this);
    }
}

module.exports = APIKey;
