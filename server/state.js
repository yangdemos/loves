/**
 * Shared in-memory state for uploads and jobs.
 * No database — simple objects keyed by UUID.
 */

/** @type {Object<string, { id: string, filename: string, originalName: string, path: string }>} */
const uploadedFiles = {};

/** @type {Object<string, { jobId: string, status: string, progress: number, outputFile: string|null, error: string|null }>} */
const jobs = {};

module.exports = { uploadedFiles, jobs };
