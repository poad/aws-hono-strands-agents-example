import { getAccessToken } from './access-token-manager.js';
import { logger } from '../logging.js';
import httpTraceing from '@opentelemetry/exporter-trace-otlp-http';
import httpLogs from '@opentelemetry/exporter-logs-otlp-http';
import httpMetrics from '@opentelemetry/exporter-metrics-otlp-http';


import dotenv from '@dotenvx/dotenvx';
import { LogRecordExporter } from '@opentelemetry/sdk-logs';
import { PushMetricExporter } from '@opentelemetry/sdk-metrics';
import { SpanExporter } from '@opentelemetry/sdk-trace-base';

if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  dotenv.config({ path: ['.env', '.env.test'], override: true });
}

export const init = async (): Promise<{ trace?: SpanExporter, logs?: LogRecordExporter, metric?: PushMetricExporter, flush: () => Promise<void> }> => {
  const token = await getAccessToken();
  if (!token) {
    logger.warn('Databricks Accsess token is undefined');
    return {
      flush: async () => {
        logger.trace('skip');
      },
    };
  }
  const ucSchema = process.env.DATABRICKS_UC_SCHEMA_NAME;
  if (!ucSchema) {
    logger.warn('DATABRICKS_UC_SCHEMA_NAME is undefined');
    return {
      flush: async () => {
        logger.trace('skip');
      },
    };
  }

  const enableTracing = process.env.ENABLE_TRACING?.toLocaleLowerCase() === 'true';
  const enableLogs = process.env.ENABLE_LOGS?.toLocaleLowerCase() === 'true';
  const enableMetrics = process.env.ENABLE_METRICS?.toLocaleLowerCase() === 'true';

  const url = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const tablePrefix = process.env.DATABRICKS_UC_TABLE_PREFIX;
  if (!tablePrefix) {
    return {
      flush: async () => {
        logger.trace('skip');
      },
    };
  }
  const traceTableName = `${ucSchema}.${tablePrefix}_otel_spans`;
  const logsTableName = `${ucSchema}.${tablePrefix}_otel_logs`;
  const metricTableName = `${ucSchema}.${tablePrefix}_otel_metrics`;

  const commonHeaders = {
    'content-type': 'application/x-protobuf',
    Authorization: `Bearer ${token}`,
  };

  const traceEndpoint = `${url}/api/2.0/otel/v1/traces`;
  console.log(traceEndpoint);
  const traceHeaders = {
    ...commonHeaders,
    'X-Databricks-UC-Table-Name': traceTableName,
  };
  const traceExporter = enableTracing ? new httpTraceing.OTLPTraceExporter({
    url: traceEndpoint,
    headers: traceHeaders,
  }) : undefined;

  const logsEndpoint = `${url}/api/2.0/otel/v1/logs`;
  const logsHeaders = {
    ...commonHeaders,
    'X-Databricks-UC-Table-Name': logsTableName,
  };
  const logsExporter = enableLogs ? new httpLogs.OTLPLogExporter({
    url: logsEndpoint,
    headers: logsHeaders,
  }) : undefined;

  const metricsEndpoint = `${url}/api/2.0/otel/v1/metrics`;
  const metricsHeaders = {
    ...commonHeaders,
    'X-Databricks-UC-Table-Name': metricTableName,
  };
  const metricExporter = enableMetrics ? new httpMetrics.OTLPMetricExporter({
    url: metricsEndpoint,
    headers: metricsHeaders,
  }) : undefined;

  return {
    trace: traceExporter,
    logs: logsExporter,
    metric: metricExporter,
    flush: async () => {
      await traceExporter?.forceFlush();
      await logsExporter?.forceFlush();
      await metricExporter?.forceFlush();
    },
  };
};
