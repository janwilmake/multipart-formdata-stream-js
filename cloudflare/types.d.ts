// Type definitions for multipart-parser
export as namespace MultipartParser;

/**
 * Represents the parsed content disposition from a multipart form part header
 */
export type ContentDisposition = {
  /** Field name from the Content-Disposition header */
  name: string;
  /** Optional filename if the part represents a file upload */
  filename?: string;
};

/**
 * Represents a single part from a multipart form data payload
 */
export type Part = {
  /** Field name from the Content-Disposition header */
  name: string;
  /** Part content as a Uint8Array or async iterable of chunks */
  data: Uint8Array | AsyncIterableIterator<Uint8Array>;
  /** Raw header lines from the part */
  headerLines: string[];
  /** Optional filename if the part represents a file upload */
  filename?: string;
  /** MIME type of the part content */
  "content-type"?: string;
  /** Uncompressed size of the content in bytes */
  "content-length"?: string;
  /** Encoding method used for the content transfer */
  "content-transfer-encoding"?:
    | "binary"
    | "8bit"
    | "quoted-printable"
    | "base64"
    | "7bit";
  /** Non-standard header for URL of binary file */
  "x-url"?: string;
  /** Non-standard header for file hash */
  "x-file-hash"?: string;
  /** Allow additional custom headers */
  [key: string]: any;
};

/**
 * Symbol used to indicate a needle match in stream search results
 */
export const MATCH: unique symbol;

/**
 * Implements the Boyer-Moore-Horspool string search algorithm
 */
export class StreamSearch {
  /**
   * Creates a new StreamSearch instance
   * @param needle The pattern to search for
   */
  constructor(needle: Uint8Array | string);

  /**
   * Feed data to the search algorithm
   * @param chunk Data chunk to search in
   * @returns Array of tokens (Uint8Array data or MATCH symbol)
   */
  feed(chunk: Uint8Array): (Uint8Array | typeof MATCH)[];

  /**
   * End the search and return remaining lookbehind buffer
   * @returns Remaining data
   */
  end(): Uint8Array;
}

/**
 * Class that searches a readable stream for a pattern
 */
export class ReadableStreamSearch {
  /**
   * Creates a new ReadableStreamSearch instance
   * @param needle The pattern to search for
   * @param readableStream Stream to search in
   */
  constructor(
    needle: Uint8Array | string,
    readableStream: ReadableStream<Uint8Array>,
  );

  /**
   * Get chunks between matches
   * @returns Async iterator yielding arrays of chunks between matches
   */
  chunks(): AsyncIterableIterator<Uint8Array[]>;

  /**
   * Get all chunks as strings
   * @returns Promise resolving to array of all strings
   */
  allStrings(): Promise<string[]>;

  /**
   * Get strings between matches
   * @returns Async iterator yielding strings between matches
   */
  strings(): AsyncIterableIterator<string>;

  /**
   * Get arrays between matches
   * @returns Async iterator yielding arrays between matches
   */
  arrays(): AsyncIterableIterator<Uint8Array>;

  /**
   * Async iterator for search results
   * @returns Async iterator yielding search tokens
   */
  [Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array | typeof MATCH>;
}

/**
 * Stream multipart form data without collecting all parts in memory
 * @param body Stream containing multipart data
 * @param boundary Boundary string from Content-Type header
 * @returns Async iterator yielding parts with streamed data
 */
export function streamMultipart(
  body: ReadableStream<Uint8Array>,
  boundary: string,
): AsyncIterableIterator<Part>;

/**
 * Iterate over multipart form data, collecting each part's data
 * @param body Stream containing multipart data
 * @param boundary Boundary string from Content-Type header
 * @returns Async iterator yielding parts with collected data
 */
export function iterateMultipart(
  body: ReadableStream<Uint8Array>,
  boundary: string,
): AsyncIterableIterator<Part>;

/**
 * Parse multipart form data into an array of parts
 * @param body Stream containing multipart data
 * @param boundary Boundary string from Content-Type header
 * @returns Promise resolving to array of parts
 */
export function parseMultipart(
  body: ReadableStream<Uint8Array>,
  boundary: string,
): Promise<Part[]>;

/**
 * Converts a string to a Uint8Array
 * @param s The string to convert
 * @returns UTF-8 encoded bytes
 */
export function stringToArray(s: string): Uint8Array;

/**
 * Converts a Uint8Array to a string
 * @param a The array to convert
 * @returns Decoded string
 */
export function arrayToString(a: Uint8Array): string;

/**
 * Merges multiple Uint8Arrays into one
 * @param arrays Arrays to merge
 * @returns Combined array
 */
export function mergeArrays(...arrays: Uint8Array[]): Uint8Array;

/**
 * Compares two Uint8Arrays for equality
 * @param a First array
 * @param b Second array
 * @returns Whether arrays are equal
 */
export function arraysEqual(a: Uint8Array, b: Uint8Array): boolean;

/**
 * Options for getReadableFormDataStream function
 */
export type ReadableStreamOptions = {
  contentType: string | null;
  body: ReadableStream<Uint8Array<ArrayBufferLike>> | null;
  /** Optional function to filter parts (return true to keep, false to discard) */
  filterPart?: (part: Part) => { ok: boolean; stop?: boolean };
  /** Optional async function to transform parts or filter them out (return null to discard) */
  transformPart?: (
    part: Part,
  ) => Promise<{ part: Part | null; stop?: boolean }>;
  /** Optional custom boundary for output (defaults to input boundary) */
  outputBoundary?: string;
};

/**
 * Creates a readable stream of filtered and/or transformed multipart form-data
 * @param options Configuration options for processing
 * @returns Promise resolving to object with readable stream and boundary
 */
export function getReadableFormDataStream(
  options: ReadableStreamOptions,
): Promise<{ readable: ReadableStream<Uint8Array>; boundary: string }>;

/**
 * Builds header lines from Part properties
 * @param part The part to generate headers for
 * @returns Array of header lines
 */
export function buildHeaderLines(part: Part): string[];
