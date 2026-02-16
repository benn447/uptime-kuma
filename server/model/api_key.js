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
            expiryDate: this.expiry_date,
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
            expiryDate: this.expiry_date,
            lastUsed: this.last_used,
        };
    }

    /**
     * Create a new API key
     * @param {number} userId - User ID
     * @param {string} name - Name for the API key
     * @param {Date|null} expiryDate - Optional expiry date
     * @returns {Promise<APIKey>} Created API key
     */
    static async create(userId, name, expiryDate = null) {
        const bean = R.dispense("api_key");
        bean.user_id = userId;
        bean.name = name;
        bean.key = generateAPIKey();
        bean.active = true;
        bean.expiry_date = expiryDate;
        await R.store(bean);
        return bean;
    }

    /**
     * Find an API key by its key value
     * @param {string} key - API key
     * @returns {Promise<APIKey|null>} API key or null
     */
    static async findByKey(key) {
        return await R.findOne("api_key", " `key` = ? AND active = 1 ", [ key ]);
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
        if (!this.expiry_date) {
            return false;
        }
        return dayjs().isAfter(dayjs(this.expiry_date));
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

module.exports = {
    APIKey,
};
