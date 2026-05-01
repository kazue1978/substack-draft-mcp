#!/usr/bin/env node
import { loadDotEnv } from "./env.mjs";
import { handleRequest } from "./mcp.mjs";

loadDotEnv();

const MAX_MESSAGE_BYTES = 1024 * 1024;
let buffer = Buffer.alloc(0);

function writeMessage(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

function readOneMessage() {
  const headerEnd = buffer.indexOf("\r\n\r\n");
  if (headerEnd === -1) {
    return null;
  }

  const headerText = buffer.subarray(0, headerEnd).toString("utf8");
  const lengthMatch = headerText.match(/Content-Length:\s*(\d+)/i);
  if (!lengthMatch) {
    throw new Error("Missing Content-Length header.");
  }

  const contentLength = Number(lengthMatch[1]);
  if (!Number.isSafeInteger(contentLength) || contentLength < 0 || contentLength > MAX_MESSAGE_BYTES) {
    throw new Error("Invalid or oversized Content-Length header.");
  }

  const messageStart = headerEnd + 4;
  const messageEnd = messageStart + contentLength;
  if (buffer.length < messageEnd) {
    return null;
  }

  const body = buffer.subarray(messageStart, messageEnd).toString("utf8");
  buffer = buffer.subarray(messageEnd);
  return JSON.parse(body);
}

async function drainMessages() {
  while (true) {
    const request = readOneMessage();
    if (!request) {
      return;
    }

    const response = await handleRequest(request);
    if (response) {
      writeMessage(response);
    }
  }
}

process.stdin.on("data", async (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  if (buffer.length > MAX_MESSAGE_BYTES * 2) {
    buffer = Buffer.alloc(0);
    writeMessage({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32600,
        message: "Input buffer exceeded MCP server limit.",
      },
    });
    return;
  }

  try {
    await drainMessages();
  } catch (error) {
    writeMessage({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32603,
        message: error.message,
      },
    });
  }
});

process.stdin.resume();
