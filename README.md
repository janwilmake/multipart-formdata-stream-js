# multipart-formdata-stream-js

A streaming multipart form data parser that works across multiple environments: Node.js, Cloudflare Workers, browsers, and other JavaScript runtimes.

## Features

- Streaming parser - process data as it arrives
- Minimal dependencies - zero external dependencies
- Universal compatibility - works in Node.js, browsers, and Cloudflare Workers
- Handles large files efficiently
- TypeScript type definitions included

# Context for LLMs

- For building a Cloudflare Worker FormData Transformer, see [the cloudflare folder on uithub](https://uithub.com/janwilmake/multipart-formdata-stream-js/tree/main/cloudflare)

## Installation

```bash
# Using npm
npm install multipart-formdata-stream-js
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

## Attributions

- Port from https://github.com/ssttevee/js-multipart-parser/tree/master into JS so its easier to work with in vanilla JS but still works fine in Typescript as well
- Claude helped me make this
- https://github.com/umdjs/umd
- https://x.com/zplesiv for giving me the insight to go with Multipart FormData, not with JSON Sequences, for UIT.

## Changelog

- **April 1, 2025**: Created this based off https://github.com/ssttevee/js-multipart-parser
- **April 2, 2025**: Added `getReadableFormDataStream` to easily build 'FormData transformers'
