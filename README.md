# multipart-formdata-stream-js

A streaming multipart form data parser that works across multiple environments: Node.js, Cloudflare Workers, browsers, and other JavaScript runtimes.

## Features

- Streaming parser - process data as it arrives
- Minimal dependencies - zero external dependencies
- Universal compatibility - works in Node.js, browsers, and Cloudflare Workers
- Handles large files efficiently
- TypeScript type definitions included

## Installation

```bash
# Using npm
npm install multipart-formdata-stream-js

# Using yarn
yarn add multipart-formdata-stream-js

# Using pnpm
pnpm add multipart-formdata-stream-js
```

## CDN Usage

```html
<script src="https://multipartjs.uithub.com/index.js"></script>
```

## Usage Examples

### Browser (via script tag)

```html
<script src="https://multipartjs.uithub.com/index.js"></script>
<script>
  // Functions are available under the MultipartParser global
  const { parseMultipart, streamMultipart } = MultipartParser;

  // Example form submission handler
  document.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(event.target);
    const request = new Request("/upload", {
      method: "POST",
      body: formData,
    });

    // Extract the boundary from the content-type header
    const contentType = request.headers.get("content-type");
    const boundary = contentType.split("boundary=")[1];

    // Parse the multipart data
    const parts = await parseMultipart(request.body, boundary);
    console.log("Parsed form data parts:", parts);
  });
</script>
```

### ES Modules (Browser)

```javascript
import {
  parseMultipart,
  streamMultipart,
} from "https://multipartjs.uithub.com/index.js";

async function handleFormSubmit(formData) {
  // Get the form data as a stream
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(formData);
      controller.close();
    },
  });

  // Extract boundary from content-type
  const boundary =
    "----WebKitFormBoundary" + Math.random().toString(16).substr(2);

  // Process the multipart data
  for await (const part of streamMultipart(stream, boundary)) {
    console.log(`Field name: ${part.name}`);
    if (part.filename) {
      console.log(`Filename: ${part.filename}`);
    }

    // Process the part data (Uint8Array)
    const data = await collectData(part.data);
    console.log(`Data length: ${data.length} bytes`);
  }
}

// Helper to collect all data from a stream
async function collectData(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return MultipartParser.mergeArrays(...chunks);
}
```

### Node.js (CommonJS)

```javascript
const { parseMultipart } = require("multipart-formdata-stream-js");
const fs = require("fs");
const http = require("http");

http
  .createServer(async (req, res) => {
    if (
      req.method === "POST" &&
      req.headers["content-type"]?.includes("multipart/form-data")
    ) {
      try {
        // Extract boundary from content-type header
        const contentType = req.headers["content-type"];
        const boundary = contentType.split("boundary=")[1];

        // Convert Node.js readable stream to Web API ReadableStream
        const webStream = nodeStreamToWebStream(req);

        // Parse the multipart form data
        const parts = await parseMultipart(webStream, boundary);

        // Process the parts
        for (const part of parts) {
          console.log(`Field name: ${part.name}`);

          if (part.filename) {
            // Save file
            fs.writeFileSync(
              `./uploads/${part.filename}`,
              Buffer.from(part.data),
            );
            console.log(`Saved file: ${part.filename}`);
          } else {
            // Process form field
            const value = Buffer.from(part.data).toString("utf-8");
            console.log(`Field value: ${value}`);
          }
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        console.error("Error processing form data:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    } else {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: false,
          error: "Method not allowed or wrong content type",
        }),
      );
    }
  })
  .listen(3000, () => {
    console.log("Server running on port 3000");
  });

// Helper function to convert Node.js readable stream to Web API ReadableStream
function nodeStreamToWebStream(nodeStream) {
  return new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      nodeStream.on("end", () => {
        controller.close();
      });
      nodeStream.on("error", (err) => {
        controller.error(err);
      });
    },
    cancel() {
      nodeStream.destroy();
    },
  });
}
```

### Node.js (ESM)

```javascript
import { parseMultipart } from "multipart-formdata-stream-js";
import { createServer } from "http";
import { writeFile } from "fs/promises";

// Same server code as CommonJS example, but using ESM imports and async/await
createServer(async (req, res) => {
  if (
    req.method === "POST" &&
    req.headers["content-type"]?.includes("multipart/form-data")
  ) {
    try {
      const contentType = req.headers["content-type"];
      const boundary = contentType.split("boundary=")[1];
      const webStream = nodeStreamToWebStream(req);
      const parts = await parseMultipart(webStream, boundary);

      // Process parts
      for (const part of parts) {
        if (part.filename) {
          await writeFile(`./uploads/${part.filename}`, Buffer.from(part.data));
          console.log(`Saved file: ${part.filename}`);
        }
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      console.error("Error:", error);
      res.writeHead(500);
      res.end(JSON.stringify({ error: error.message }));
    }
  } else {
    res.writeHead(405);
    res.end("Method not allowed");
  }
}).listen(3000);

// Same helper function as in CommonJS example
function nodeStreamToWebStream(nodeStream) {
  // Implementation as above
}
```

### Cloudflare Workers

```javascript
import { mergeArrays, streamMultipart } from "./index";

export default {
  async fetch(request, env, ctx) {
    if (request.method === "POST") {
      try {
        // Extract the boundary from the content-type header
        const contentType = request.headers.get("content-type");
        if (!contentType || !contentType.includes("multipart/form-data")) {
          return new Response("Expected multipart/form-data", { status: 400 });
        }

        const boundary = contentType.split("boundary=")[1];
        if (!boundary) {
          return new Response("No boundary found in content-type", {
            status: 400,
          });
        }

        const results = [];
        for await (const part of streamMultipart(request.body, boundary)) {
          console.log(`Field name: ${part.name}`);
          if (part.filename) {
            console.log(`Filename: ${part.filename}`);
          }
          results.push(part);

          // Process the part data (Uint8Array)
          const data = await collectData(part.data);
          console.log(`Data length: ${data.length} bytes`);
        }

        return new Response(JSON.stringify(results), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        return new Response(`Error processing form: ${error.message}`, {
          status: 500,
        });
      }
    }

    // For non-POST requests, return simple form
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <body>
          <h1>Multipart Form Example</h1>
          <form method="post" enctype="multipart/form-data">
            <p><input type="text" name="name" placeholder="Your name"></p>
            <p><input type="file" name="file"></p>
            <p><button type="submit">Submit</button></p>
          </form>
        </body>
      </html>
    `,
      { headers: { "Content-Type": "text/html" } },
    );
  },
};

async function collectData(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return mergeArrays(...chunks);
}
```

## API Reference

### Main Functions

#### `parseMultipart(body, boundary)`

Parses a multipart form data stream into an array of parts.

- **Parameters**:
  - `body`: `ReadableStream<Uint8Array>` - The stream containing multipart form data
  - `boundary`: `string` - The boundary string from the Content-Type header
- **Returns**: `Promise<Part[]>` - Promise resolving to an array of parsed parts

#### `streamMultipart(body, boundary)`

Streams multipart form data, yielding each part as it is processed.

- **Parameters**:
  - `body`: `ReadableStream<Uint8Array>` - The stream containing multipart form data
  - `boundary`: `string` - The boundary string from the Content-Type header
- **Returns**: `AsyncIterableIterator<Part>` - Async iterator yielding parts as they are processed

#### `iterateMultipart(body, boundary)`

Like `streamMultipart` but collects each part's data before yielding.

- **Parameters**:
  - `body`: `ReadableStream<Uint8Array>` - The stream containing multipart form data
  - `boundary`: `string` - The boundary string from the Content-Type header
- **Returns**: `AsyncIterableIterator<Part>` - Async iterator yielding complete parts

### Helper Functions

#### `stringToArray(s)`

Converts a string to a Uint8Array with UTF-8 encoding.

#### `arrayToString(a)`

Converts a Uint8Array to a string.

#### `mergeArrays(...arrays)`

Merges multiple Uint8Arrays into one.

#### `arraysEqual(a, b)`

Compares two Uint8Arrays for equality.

### Types

#### `Part`

- `name`: `string` - Field name
- `data`: `Uint8Array` - The field data
- `filename`: `string` (optional) - Original filename (for file fields)
- `contentType`: `string` (optional) - Content type of the part

## Browser Compatibility

- Chrome 65+
- Firefox 57+
- Safari 12+
- Edge 79+

## License

MIT

## Attributions

- Port from https://github.com/ssttevee/js-multipart-parser/tree/master into JS so its easier to work with in vanilla JS but still works fine in Typescript as well
- Claude helped me make this
- https://github.com/umdjs/umd
- https://x.com/zplesiv for giving me the insight to go with Multipart FormData, not with JSON Sequences, for UIT.
