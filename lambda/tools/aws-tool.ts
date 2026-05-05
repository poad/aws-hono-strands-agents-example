import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport';
import { McpClient, ToolList } from '@strands-agents/sdk';

export const mcp = new McpClient({
  transport: new StreamableHTTPClientTransport(
    new URL('https://knowledge-mcp.global.api.aws'),
  ) as Transport,
});

export const tools: ToolList = await mcp.listTools();
