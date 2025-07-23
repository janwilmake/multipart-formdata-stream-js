// Type definitions for multipart-parser
export as namespace MultipartParser;

/**
 * Represents a multipart form part with headers and streaming data
 */
export interface Part {
  /** Field name from the Content-Disposition header */
  name: string;
  /** Async iterable for streaming the part's data */
  data: AsyncIterableIterator<Uint8Array>;
  /** Array of raw header lines */
  headerLines: string[];
  /** Optional filename if the part represents a file upload */
  filename?: string;
  /** MIME content type */
  "content-type"?: string;
  /** Uncompressed size in bytes */
  "content-length"?: string;
  /** Content transfer encoding method */
  "content-transfer-encoding"?:
    | "binary"
    | "8bit"
    | "quoted-printable"
    | "base64"
    | "7bit";
  /** Non-standard: URL of the binary file */
  "x-url"?: string;
  /** Non-standard: Hash of the file */
  "x-file-hash"?: string;
  /** Non-standard: Filter header */
  "x-filter"?: string;
  /** Non-standard: Error header */
  "x-error"?: string;
  /** Allow any other header properties */
  [key: string]: any;
}

/**
 * Represents the parsed content disposition from a multipart form part header
 */
export interface ContentDisposition {
  /** Field name from the Content-Disposition header */
  name: string;
  /** Optional filename if the part represents a file upload */
  filename?: string;
}

/**
 * Symbol used to indicate a needle match in stream search results
 */
export const MATCH: unique symbol;

/**
 * Type for tokens returned by the StreamSearch
 */
export type Token = Uint8Array | typeof MATCH;

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
  feed(chunk: Uint8Array): Token[];

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
    readableStream: ReadableStream<Uint8Array>
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
  [Symbol.asyncIterator](): AsyncIterableIterator<Token>;
}

/**
 * Stream multipart form data without collecting all parts in memory
 * @param body Stream containing multipart data
 * @param boundary Boundary string from Content-Type header
 * @returns Async iterator yielding parts with streamed data
 */
export function streamMultipart(
  body: ReadableStream<Uint8Array>,
  boundary: string
): AsyncIterableIterator<Part>;

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
export interface ReadableStreamOptions {
  /** Content-Type header value containing boundary information */
  contentType: string | null;
  /** ReadableStream containing multipart form data */
  body: ReadableStream<Uint8Array> | null;
  /** Optional sync function to filter parts */
  filterPart?: (part: Part) => { ok: boolean; stop?: boolean };
  /** Optional async function to transform parts or filter them out */
  transformPart?: (
    part: Part
  ) => Promise<{ part: Part | null; stop?: boolean }>;
  /** Optional custom boundary for output (defaults to input boundary) */
  outputBoundary?: string;
}

/**
 * Creates a readable stream of filtered and/or transformed multipart form-data
 * @param options Configuration options for processing
 * @returns Promise resolving to object with readable stream and boundary
 */
export function getReadableFormDataStream(
  options: ReadableStreamOptions
): Promise<{ readable: ReadableStream<Uint8Array>; boundary: string }>;

/**
 * Builds header lines from Part properties
 * @param part The part to generate headers for
 * @returns Array of header lines
 */
export function buildHeaderLines(part: Part): string[];

/**
 * Parse a Content-Disposition header value
 * @param header Header value to parse
 * @returns Parsed content disposition object
 */
export function parseContentDisposition(header: string): ContentDisposition;
