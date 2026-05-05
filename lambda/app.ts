import { awsAgent } from './agents/aws-agent.js';
import { mcp } from './tools/aws-tool.js';
import { initialize } from './telemetry/instrumentation.js';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { httpInstrumentationMiddleware } from '@hono/otel';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

if (process.env.DATABRICKS_OAUTH_TOKEN_ENDPOINT && process.env.DATABRICKS_OAUTH_CLIENT_ID && process.env.DATABRICKS_OAUTH_CLIENT_SECRET && process.env.DATABRICKS_UC_SCHEMA_NAME && process.env.ENABLE_TRACING?.toLocaleLowerCase() === 'true') {
  const instrumentation = await initialize();
  const openTelemetrySDK = new NodeSDK({
    traceExporter: instrumentation.traceExporter,
    metricReaders: instrumentation.metricReaders,
    logRecordProcessors: instrumentation.logRecordProcessors,
  });

  openTelemetrySDK.start();
}

export const app = new Hono();

const instrumentationConfig = {
  serviceName: 'aws-hono-strands-agents-lambda',
  serviceVersion: '1.0.0',
  captureRequestHeaders: ['user-agent', 'service-name'],
};
app.use(httpInstrumentationMiddleware(instrumentationConfig));


app.get('/ping', (c) =>
  c.json({
    status: 'Healthy',
    time_of_last_update: Math.floor(Date.now() / 1000),
  }),
);

app.post('/', async (c) => {
  const body = await c.req.json();
  // Input validation
  if (!body || typeof body !== 'object') {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const { prompt } = body;

  if (!prompt || typeof prompt !== 'string') {
    return c.json({ error: 'prompt is required and must be a string' }, 400);
  }

  if (prompt.length > 10000) { // Reasonable limit
    return c.json({ error: 'prompt is too long' }, 400);
  }

  // ストリーミングレスポンス
  try {
    const streamResult = await awsAgent.stream(prompt);
    return streamSSE(c, async (stream) => {
      for await (const event of streamResult) {
        if (
          event.type === 'modelStreamUpdateEvent' &&
          event.event.type === 'modelContentBlockDeltaEvent' &&
          event.event.delta.type === 'textDelta'
        ) {
          await stream.write(event.event.delta.text);
        }
      }
    });
  } catch (e) {
    await mcp.disconnect();
    throw e;
  }
  return c.json({ error: 'prompt is too long' }, 400);
});
