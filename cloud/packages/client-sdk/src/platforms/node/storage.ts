import fs from 'fs/promises';
import path from 'path';
import { IStorage } from '../../interfaces/storage';

export class FileStorage implements IStorage {
    private storagePath: string;
    private cache: Record<string, string> = {};

    constructor(baseDir: string = '.mentra') {
        this.storagePath = path.join(process.cwd(), baseDir, 'storage.json');
    }

    private async ensureLoaded() {
        try {
            const data = await fs.readFile(this.storagePath, 'utf-8');
            this.cache = JSON.parse(data);
        } catch {
            // File doesn't exist or is invalid, start empty
            this.cache = {};
        }
    }

    private async persist() {
        await fs.mkdir(path.dirname(this.storagePath), { recursive: true });
        await fs.writeFile(this.storagePath, JSON.stringify(this.cache, null, 2));
    }

    async getItem(key: string): Promise<string | null> {
        await this.ensureLoaded();
        return this.cache[key] || null;
    }

    async setItem(key: string, value: string): Promise<void> {
        await this.ensureLoaded();
        this.cache[key] = value;
        await this.persist();
    }

    async removeItem(key: string): Promise<void> {
        await this.ensureLoaded();
        delete this.cache[key];
        await this.persist();
    }

    async clear(): Promise<void> {
        this.cache = {};
        await this.persist();
    }
}
