import { init } from '../telemetry/otel-exporters.js';
import { logger } from '../logging.js';
import * as opentelemetry from '@opentelemetry/api';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import {
  NodeTracerProvider,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import {
  defaultResource,
  resourceFromAttributes,
} from '@opentelemetry/resources';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';

import { logs } from '@opentelemetry/api-logs';
import {
  LoggerProvider,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import dotenv from '@dotenvx/dotenvx';

export const initialize = async () => {

  if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
    dotenv.config({ path: ['.env', '.env.test'], override: true });
  }

  const exporters = await init();

  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);

  logger.info('begin initialize opentelemetry exporters');

  const resource = defaultResource().merge(
    resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'agent-langchain',
      [ATTR_SERVICE_VERSION]: '0.1.0',
      ['openinference.project.name']: 'default',
    }),
  );

  const metricReader = exporters.metric ? new PeriodicExportingMetricReader({
    exporter: exporters.metric,
    exportIntervalMillis: 10000,
  }) : undefined;


  if (exporters.trace) {
    logger.info('Enable tracing');

    const provider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(
        exporters.trace,
      ),
      ],
      resource,
    });

    registerInstrumentations({
      instrumentations: [],
    });

    registerInstrumentations({
      instrumentations: [
        getNodeAutoInstrumentations({
        }),
      ],
    });
    provider.register();
  }

  if (metricReader) {
    logger.info('Enable metrics');

    const myServiceMeterProvider = new MeterProvider({
      resource: resource,
      readers: [metricReader],
    });

    opentelemetry.metrics.setGlobalMeterProvider(myServiceMeterProvider);
  }

  const logRecordProcessor = exporters.logs ? new SimpleLogRecordProcessor(
    exporters.logs,
  ) : undefined;

  if (logRecordProcessor) {
    logger.info('Enable logs');

    const loggerProvider = new LoggerProvider({
      processors: [
        logRecordProcessor,
      ],
    });

    logs.setGlobalLoggerProvider(loggerProvider);
  }

  logger.info('👀 OpenInference initialized');

  return {
    traceExporter: exporters.trace,
    metricReaders: metricReader ? [metricReader] : undefined,
    logRecordProcessors: logRecordProcessor ? [logRecordProcessor] : undefined,
  };
};
