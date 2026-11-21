/** Hard caps for digestion. Enforced client-side while parsing and re-checked on the server. */
export const DATASET_LIMITS = {
  maxFileBytes: 25 * 1024 * 1024,
  maxRows: 100_000,
  maxColumns: 200,
  maxCellChars: 4_096,
  batchRows: 500,
  maxBatchBytes: 1_500_000,
  searchTextChars: 4_096,
  sampleRows: 200,
} as const;

export const ARCHIVE_LIMITS = {
  maxEntries: 2_000,
  maxTotalUncompressed: 100 * 1024 * 1024,
  maxRatio: 100,
  maxEntryBytes: 50 * 1024 * 1024,
} as const;

export const XML_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  maxNodes: 200_000,
  maxDepth: 64,
} as const;

export const VCARD_LIMITS = { maxPhotoBytes: 256 * 1024, maxContacts: 5_000 } as const;
export const IMAGE_LIMITS = { maxPixels: 40_000_000, displayEdge: 1600, thumbEdge: 160 } as const;
export const EMAIL_LIMITS = { maxMessages: 500, maxBodyChars: 200_000 } as const;
export const MAX_EXTRACTED_TEXT_CHARS = 400_000;
