import { StreamableHTTPClientTransport, Transport } from '@modelcontextprotocol/client';
import { McpClient, ToolList } from '@strands-agents/sdk';

export const mcp = new McpClient({
  transport: new StreamableHTTPClientTransport(
    new URL('https://knowledge-mcp.global.api.aws'),
  ) as Transport,
});

export const tools: ToolList = await mcp.listTools();
