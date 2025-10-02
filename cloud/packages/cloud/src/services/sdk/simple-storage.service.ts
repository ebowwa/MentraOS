/**
 * Simple Storage Service for MentraOS Cloud (SDK Audience)
 *
 * Provides key-value storage operations scoped by user email and packageName.
 * Data is persisted in MongoDB using the SimpleStorage model, where each document
 * represents a storage namespace for a specific (email, packageName) pair.
 *
 * Notes:
 * - All values are stored as strings (Record<string, string>).
 * - Consumers should enforce authorization and package scoping before calling into this service.
 *
 * Author: MentraOS Team
 */

import {
  SimpleStorage,
  SimpleStorageI,
} from "../../models/simple-storage.model";

/**
 * Get the entire storage object for a given user and package.
 * Returns an empty object if no storage exists.
 */
export async function getAll(
  email: string,
  packageName: string,
): Promise<Record<string, string>> {
  const doc = await SimpleStorage.findOne({ email, packageName })
    .lean<SimpleStorageI>()
    .exec();
  return (doc?.data as Record<string, string>) ?? {};
}

/**
 * Get a single value by key for a given user and package.
 * Returns undefined if not found or storage does not exist.
 */
export async function getKey(
  email: string,
  packageName: string,
  key: string,
): Promise<string | undefined> {
  const doc = await SimpleStorage.findOne({ email, packageName })
    .lean<SimpleStorageI>()
    .exec();
  const storage = (doc?.data as Record<string, string>) ?? undefined;
  return storage ? storage[key] : undefined;
}

/**
 * Set a single key to a string value (upsert).
 * Creates the storage document if it does not exist.
 */
export async function setKey(
  email: string,
  packageName: string,
  key: string,
  value: string,
): Promise<void> {
  await SimpleStorage.findOneAndUpdate(
    { email, packageName },
    { $set: { [`data.${key}`]: value } },
    { upsert: true, new: true },
  ).exec();
}

/**
 * Upsert multiple key/value pairs at once.
 * No-op when data is empty.
 */
export async function updateMany(
  email: string,
  packageName: string,
  data: Record<string, string>,
): Promise<void> {
  const entries = Object.entries(data);
  if (entries.length === 0) return;

  const setPayload: Record<string, string> = {};
  for (const [key, value] of entries) {
    setPayload[`data.${key}`] = value;
  }

  await SimpleStorage.findOneAndUpdate(
    { email, packageName },
    { $set: setPayload },
    { upsert: true, new: true },
  ).exec();
}

/**
 * Delete a single key for a given user and package.
 * Returns true if the storage document exists (regardless of whether the key existed),
 * false if the storage document does not exist.
 */
export async function deleteKey(
  email: string,
  packageName: string,
  key: string,
): Promise<boolean> {
  const result = await SimpleStorage.findOneAndUpdate(
    { email, packageName },
    { $unset: { [`data.${key}`]: 1 } },
    { new: true },
  ).exec();

  return !!result;
}

/**
 * Clear all keys for a given user and package (resets to an empty object).
 * Returns true if the storage document exists, false otherwise.
 */
export async function clearAll(
  email: string,
  packageName: string,
): Promise<boolean> {
  const result = await SimpleStorage.findOneAndUpdate(
    { email, packageName },
    { $set: { data: {} } },
    { new: true },
  ).exec();

  return !!result;
}
