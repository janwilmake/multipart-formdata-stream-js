# multipart-formdata-stream-js

A streaming multipart form data parser and transformer that works across multiple environments: Node.js, Cloudflare Workers, browsers, and other JavaScript runtimes.

## Features

- **Streaming parser** - process data as it arrives without loading everything into memory
- **Zero dependencies** - no external dependencies
- **Universal compatibility** - works in Node.js, browsers, and Cloudflare Workers
- **Memory efficient** - handles large files without memory issues
- **TypeScript support** - full type definitions included
- **Transform streams** - filter and modify multipart data on-the-fly

## Installation

```bash
npm install multipart-formdata-stream-js
```

## CDN Usage

```html
<script src="https://multipartjs.uithub.com/index.js"></script>
<script>
  // Functions are available under the MultipartParser global
  const { streamMultipart, getReadableFormDataStream } = MultipartParser;
</script>
```

## Core API

### `streamMultipart(body, boundary)`

The main streaming parser that processes multipart form data as an async iterator. Each part is yielded as soon as its headers are parsed, with data available as a streaming iterator.

**Parameters:**

- `body`: `ReadableStream<Uint8Array>` - The stream containing multipart form data
- `boundary`: `string` - The boundary string from the Content-Type header

**Returns:** `AsyncIterableIterator<Part>` - Async iterator yielding parts with streaming data

**Part interface:**

```typescript
interface Part {
  name: string; // Field name
  data: AsyncIterableIterator<Uint8Array>; // Streaming data
  headerLines: string[]; // Raw header lines
  filename?: string; // File name (if file upload)
  "content-type"?: string; // MIME type
  "content-length"?: string; // Size in bytes
  // ... other headers
}
```

### `getReadableFormDataStream(options)`

Creates a new multipart stream by filtering and/or transforming parts from an existing multipart stream. Perfect for proxying, filtering, or modifying form data.

**Parameters:**

```typescript
interface ReadableStreamOptions {
  contentType: string | null; // Original Content-Type header
  body: ReadableStream<Uint8Array> | null; // Original multipart stream
  filterPart?: (part: Part) => { ok: boolean; stop?: boolean };
  transformPart?: (
    part: Part
  ) => Promise<{ part: Part | null; stop?: boolean }>;
  outputBoundary?: string; // Custom boundary (optional)
}
```

**Returns:** `Promise<{ readable: ReadableStream<Uint8Array>; boundary: string }>`

## Usage Examples

### Basic Streaming Parser

```javascript
// Extract boundary from Content-Type header
const contentType = request.headers.get("content-type");
const boundary =
  contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[1] ||
  contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[2];

// Stream through each part
for await (const part of streamMultipart(request.body, boundary)) {
  console.log(`Processing field: ${part.name}`);

  if (part.filename) {
    console.log(`File upload: ${part.filename}`);
    console.log(`Content-Type: ${part["content-type"]}`);
  }

  // Stream the data
  const chunks = [];
  for await (const chunk of part.data) {
    chunks.push(chunk);
  }

  const data = new Uint8Array(
    chunks.reduce((acc, chunk) => acc + chunk.length, 0)
  );
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }

  console.log(`Received ${data.length} bytes`);
}
```

### Filtering Parts

```javascript
// Only allow image uploads, block everything else
const { readable, boundary } = await getReadableFormDataStream({
  contentType: request.headers.get("content-type"),
  body: request.body,
  filterPart: (part) => {
    // Only allow image files
    if (part.filename && part["content-type"]?.startsWith("image/")) {
      return { ok: true };
    }
    // Allow non-file fields
    if (!part.filename) {
      return { ok: true };
    }
    // Block non-image files
    return { ok: false };
  },
});

// Forward the filtered stream
return new Response(readable, {
  headers: {
    "Content-Type": `multipart/form-data; boundary=${boundary}`,
  },
});
```

### Transforming Parts

```javascript
// Resize images and add metadata
const { readable, boundary } = await getReadableFormDataStream({
  contentType: request.headers.get("content-type"),
  body: request.body,
  transformPart: async (part) => {
    if (part.filename && part["content-type"]?.startsWith("image/")) {
      // Collect image data
      const chunks = [];
      for await (const chunk of part.data) {
        chunks.push(chunk);
      }

      // Process image (example with hypothetical image processing)
      const imageBuffer = mergeArrays(...chunks);
      const resizedBuffer = await resizeImage(imageBuffer, { width: 800 });

      // Return transformed part
      return {
        part: {
          ...part,
          data: new Uint8Array(resizedBuffer),
          "content-length": resizedBuffer.length.toString(),
          "x-processed": "resized",
        },
      };
    }

    // Return unchanged for non-images
    return { part };
  },
});
```

### Cloudflare Workers Example

```javascript
export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Transform uploaded files
    const { readable, boundary } = await getReadableFormDataStream({
      contentType: request.headers.get("content-type"),
      body: request.body,
      transformPart: async (part) => {
        if (part.filename) {
          // Add timestamp to filename
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          return {
            part: {
              ...part,
              filename: `${timestamp}-${part.filename}`,
              "x-upload-time": new Date().toISOString(),
            },
          };
        }
        return { part };
      },
    });

    // Forward to storage service
    return fetch("https://storage.example.com/upload", {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body: readable,
    });
  },
};
```

### Node.js Express Middleware

```javascript
import { streamMultipart } from "multipart-formdata-stream-js";

app.post("/upload", async (req, res) => {
  const boundary =
    req.headers["content-type"].match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[1] ||
    req.headers["content-type"].match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[2];

  const files = [];
  const fields = {};

  for await (const part of streamMultipart(req, boundary)) {
    if (part.filename) {
      // Handle file upload
      const chunks = [];
      for await (const chunk of part.data) {
        chunks.push(chunk);
      }

      files.push({
        fieldname: part.name,
        filename: part.filename,
        mimetype: part["content-type"],
        size: chunks.reduce((acc, chunk) => acc + chunk.length, 0),
        buffer: Buffer.concat(chunks),
      });
    } else {
      // Handle text field
      const chunks = [];
      for await (const chunk of part.data) {
        chunks.push(chunk);
      }
      fields[part.name] = Buffer.concat(chunks).toString("utf8");
    }
  }

  res.json({ fields, files: files.length });
});
```

### Advanced: Streaming Proxy with Size Limits

```javascript
const { readable, boundary } = await getReadableFormDataStream({
  contentType: request.headers.get("content-type"),
  body: request.body,
  transformPart: async (part) => {
    // Check file size limit
    if (
      part["content-length"] &&
      parseInt(part["content-length"]) > 10_000_000
    ) {
      throw new Error(`File ${part.filename} exceeds 10MB limit`);
    }

    // Stream with size tracking
    let totalSize = 0;
    const sizeTrackingData = {
      async *[Symbol.asyncIterator]() {
        for await (const chunk of part.data) {
          totalSize += chunk.length;
          if (totalSize > 10_000_000) {
            throw new Error(
              `File ${part.filename} exceeds 10MB limit during streaming`
            );
          }
          yield chunk;
        }
      },
    };

    return {
      part: {
        ...part,
        data: sizeTrackingData,
      },
    };
  },
});
```

## Utility Functions

- `stringToArray(s)` - Convert string to Uint8Array
- `arrayToString(a)` - Convert Uint8Array to string
- `mergeArrays(...arrays)` - Merge multiple Uint8Arrays
- `arraysEqual(a, b)` - Compare Uint8Arrays for equality
- `buildHeaderLines(part)` - Generate header lines from Part object

## Error Handling

The library throws descriptive errors for malformed data:

```javascript
try {
  for await (const part of streamMultipart(body, boundary)) {
    // Process part
  }
} catch (error) {
  if (error.message.includes("malformed multipart-form")) {
    console.error("Invalid multipart data:", error.message);
  }
}
```

## Browser Compatibility

Works in all modern browsers that support:

- ReadableStream
- AsyncIterators
- Uint8Array

For older browsers, polyfills may be needed.

## Attributions

- Port from [js-multipart-parser](https://github.com/ssttevee/js-multipart-parser)
- Enhanced with streaming transforms and universal compatibility
- Built with help from Claude AI

## Changelog

- **April 1, 2025**: Initial release based on js-multipart-parser
- **April 2, 2025**: Added `getReadableFormDataStream` for stream transformation
- **July 23, 2025**: Improved types and README.
