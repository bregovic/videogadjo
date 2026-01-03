/**
 * ProxyCache - IndexedDB storage for proxy videos
 * Stores proxy videos locally for offline access and faster playback
 */

class ProxyCache {
    constructor() {
        this.dbName = 'VideoGadjoCache';
        this.dbVersion = 1;
        this.storeName = 'proxies';
        this.db = null;
        this.isReady = false;
        this.initPromise = this.init();
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                console.error('IndexedDB error:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                this.isReady = true;
                console.log('✅ ProxyCache ready');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'videoId' });
                    store.createIndex('projectId', 'projectId', { unique: false });
                    store.createIndex('cachedAt', 'cachedAt', { unique: false });
                }
            };
        });
    }

    async ensureReady() {
        if (!this.isReady) {
            await this.initPromise;
        }
    }

    /**
     * Check if a proxy is cached
     */
    async has(videoId) {
        await this.ensureReady();
        return new Promise((resolve) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(videoId);

            request.onsuccess = () => resolve(!!request.result);
            request.onerror = () => resolve(false);
        });
    }

    /**
     * Get cached proxy as blob URL
     */
    async get(videoId) {
        await this.ensureReady();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(videoId);

            request.onsuccess = () => {
                if (request.result) {
                    const blob = request.result.blob;
                    const url = URL.createObjectURL(blob);
                    resolve({
                        url,
                        size: blob.size,
                        cachedAt: request.result.cachedAt,
                        filename: request.result.filename
                    });
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Download and cache a proxy video
     */
    async cacheFromUrl(videoId, proxyUrl, metadata = {}) {
        await this.ensureReady();

        console.log(`⏳ Downloading proxy: ${videoId}`);

        try {
            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error('Failed to fetch proxy');

            const blob = await response.blob();

            const record = {
                videoId,
                projectId: metadata.projectId || 'unknown',
                filename: metadata.filename || videoId,
                blob,
                size: blob.size,
                cachedAt: new Date().toISOString()
            };

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const request = store.put(record);

                request.onsuccess = () => {
                    console.log(`✅ Cached proxy: ${videoId} (${this.formatSize(blob.size)})`);
                    resolve({
                        url: URL.createObjectURL(blob),
                        size: blob.size,
                        cachedAt: record.cachedAt
                    });
                };
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error(`❌ Failed to cache proxy: ${videoId}`, error);
            throw error;
        }
    }

    /**
     * Get or download proxy
     */
    async getOrCache(videoId, proxyUrl, metadata = {}) {
        const cached = await this.get(videoId);
        if (cached) {
            console.log(`📁 Using cached proxy: ${videoId}`);
            return cached;
        }
        return this.cacheFromUrl(videoId, proxyUrl, metadata);
    }

    /**
     * Delete a cached proxy
     */
    async delete(videoId) {
        await this.ensureReady();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(videoId);

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Delete all cached proxies for a project
     */
    async deleteProject(projectId) {
        await this.ensureReady();
        const all = await this.getAll();
        const toDelete = all.filter(p => p.projectId === projectId);

        for (const proxy of toDelete) {
            await this.delete(proxy.videoId);
        }

        return toDelete.length;
    }

    /**
     * Clear all cached proxies
     */
    async clearAll() {
        await this.ensureReady();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get all cached proxies info (without blob data)
     */
    async getAll() {
        await this.ensureReady();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();

            request.onsuccess = () => {
                const results = request.result.map(item => ({
                    videoId: item.videoId,
                    projectId: item.projectId,
                    filename: item.filename,
                    size: item.size,
                    cachedAt: item.cachedAt
                }));
                resolve(results);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get total storage usage
     */
    async getStorageStats() {
        const all = await this.getAll();
        const totalSize = all.reduce((sum, item) => sum + item.size, 0);

        // Group by project
        const byProject = {};
        all.forEach(item => {
            if (!byProject[item.projectId]) {
                byProject[item.projectId] = { count: 0, size: 0 };
            }
            byProject[item.projectId].count++;
            byProject[item.projectId].size += item.size;
        });

        return {
            totalCount: all.length,
            totalSize,
            totalSizeFormatted: this.formatSize(totalSize),
            byProject,
            items: all
        };
    }

    /**
     * Format bytes to human readable
     */
    formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// Export singleton instance
window.proxyCache = new ProxyCache();
