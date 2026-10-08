import "server-only";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Where uploaded files live. Local disk for now (set UPLOAD_DIR to a
 * persistent volume in production). An S3/R2 driver can implement the same
 * interface later without touching callers.
 */
export interface FileStorage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

class LocalStorage implements FileStorage {
  constructor(private root: string) {}

  private resolve(key: string): string {
    if (!/^[a-z0-9][a-z0-9/_.-]*$/i.test(key) || key.includes("..")) throw new Error(`Bad storage key ${key}`);
    return path.join(this.root, key);
  }

  async put(key: string, data: Buffer) {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  }

  async get(key: string) {
    return readFile(this.resolve(key));
  }

  async delete(key: string) {
    await unlink(this.resolve(key)).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
  }
}

export const storage: FileStorage = new LocalStorage(
  path.resolve(process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads")),
);
