import fs from "fs/promises";
import path from "path";
import { IStorage } from "../../interfaces/IStorage";

export class FileStorage implements IStorage {
    private storagePath: string;
    private cache: Record<string, string> = {};
    private initialized = false;

    constructor(storageDir: string = "./.mentra-storage") {
        this.storagePath = path.join(storageDir, "storage.json");
    }

    private async init(): Promise<void> {
        if (this.initialized) return;

        try {
            await fs.mkdir(path.dirname(this.storagePath), { recursive: true });
            const data = await fs.readFile(this.storagePath, "utf-8");
            this.cache = JSON.parse(data);
        } catch (err) {
            // If file doesn't exist, start empty
            this.cache = {};
        }
        this.initialized = true;
    }

    private async persist(): Promise<void> {
        await fs.writeFile(this.storagePath, JSON.stringify(this.cache, null, 2));
    }

    async setItem(key: string, value: string): Promise<void> {
        await this.init();
        this.cache[key] = value;
        await this.persist();
    }

    async getItem(key: string): Promise<string | null> {
        await this.init();
        return this.cache[key] || null;
    }

    async removeItem(key: string): Promise<void> {
        await this.init();
        delete this.cache[key];
        await this.persist();
    }

    async clear(): Promise<void> {
        this.cache = {};
        await this.persist();
    }
}
