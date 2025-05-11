/**
 * Represents a single part from a multipart form data payload
 */
export type Part = {
  /** Field name from the Content-Disposition header */
  name: string;
  /** Part content as a Uint8Array or async iterable of chunks */
  data: AsyncIterableIterator<Uint8Array>;
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

  /** Allow additional custom headers */
  [key: string]: any;
} & UITCustomHeaders;

type UITCustomHeaders = {
  /** Non-standard header for URL of binary file */
  "x-url"?: string;
  /** Should contain the file hash for binaries in UIT modules */
  "x-file-hash"?: string;
  /** If the file is filtered out, file content can be made empty, and x-filter can be set. format: plugin-id;status;message */
  "x-filter"?: `${string};${string};${string}`;
  /** If an error is encountered, file content must remain the same, and error can be set; format plugin-id;status;message */
  "x-error"?: `${string};${string};${string}`;
};
