import {
  Logger,
  LogFormatter,
  LogItem,
} from '@aws-lambda-powertools/logger';
import type {
  LogAttributes,
  UnformattedAttributes,
} from '@aws-lambda-powertools/logger/types';
import {
  logs,
  SeverityNumber,
  type AnyValueMap,
  type AnyValue,
} from '@opentelemetry/api-logs';
import type { Context } from 'aws-lambda';

const LOGGER_NAME = 'powertools-otel-bridge';

const toAnyValue = (value: unknown): AnyValue => {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(toAnyValue);
  }
  if (typeof value === 'object') {
    const result: AnyValueMap = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = toAnyValue(val);
    }
    return result;
  }
  return String(value);
};

class OpenTelemetryLogFormatter extends LogFormatter {
  private otelLogger = logs.getLogger(LOGGER_NAME);

  formatAttributes(
    attributes: UnformattedAttributes,
    additionalLogAttributes: LogAttributes,
  ): LogItem {
    const baseAttributes: LogAttributes = {
      message: attributes.message,
      service: attributes.serviceName,
      environment: attributes.environment,
      awsRegion: attributes.awsRegion,
      correlationIds: {
        awsRequestId: attributes.lambdaContext?.awsRequestId,
        xRayTraceId: attributes.xRayTraceId,
      },
      lambdaFunction: {
        name: attributes.lambdaContext?.functionName,
        arn: attributes.lambdaContext?.invokedFunctionArn,
        memoryLimitInMB: attributes.lambdaContext?.memoryLimitInMB,
        version: attributes.lambdaContext?.functionVersion,
        coldStart: attributes.lambdaContext?.coldStart,
      },
      logLevel: attributes.logLevel,
      timestamp: this.formatTimestamp(attributes.timestamp),
      logger: {
        sampleRateValue: attributes.sampleRateValue,
      },
    };

    const logItem = new LogItem({ attributes: baseAttributes });
    logItem.addAttributes(additionalLogAttributes);

    const severityMap: Record<string, SeverityNumber> = {
      TRACE: SeverityNumber.TRACE,
      DEBUG: SeverityNumber.DEBUG,
      INFO: SeverityNumber.INFO,
      WARN: SeverityNumber.WARN,
      ERROR: SeverityNumber.ERROR,
      CRITICAL: SeverityNumber.FATAL,
    };

    const otelAttributes: AnyValueMap = {
      service: attributes.serviceName,
      environment: attributes.environment,
      region: attributes.awsRegion,
      log_level: attributes.logLevel,
      timestamp: this.formatTimestamp(attributes.timestamp),
    };

    if (attributes.lambdaContext?.awsRequestId) {
      otelAttributes['aws.request_id'] = attributes.lambdaContext.awsRequestId;
    }
    if (attributes.lambdaContext?.functionName) {
      otelAttributes['aws.function_name'] = attributes.lambdaContext.functionName;
    }
    if (attributes.lambdaContext?.coldStart !== undefined) {
      otelAttributes['aws.cold_start'] = attributes.lambdaContext.coldStart;
    }
    if (attributes.xRayTraceId) {
      otelAttributes['aws.trace_id'] = attributes.xRayTraceId;
    }
    if (attributes.sampleRateValue !== undefined) {
      otelAttributes['logger.sample_rate'] = attributes.sampleRateValue;
    }

    for (const [key, value] of Object.entries(additionalLogAttributes)) {
      otelAttributes[key] = toAnyValue(value);
    }

    this.otelLogger.emit({
      severityNumber: severityMap[attributes.logLevel] ?? SeverityNumber.INFO,
      severityText: attributes.logLevel,
      body: attributes.message,
      attributes: otelAttributes,
    });

    return logItem;
  }
}

type LogLevel = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL' | 'SILENT';

const createLogger = (
  serviceName?: string,
  logLevel?: LogLevel,
): Logger => {
  return new Logger({
    serviceName: serviceName ?? process.env.AWS_LAMBDA_FUNCTION_NAME ?? 'service',
    logLevel: logLevel ?? 'INFO',
    logFormatter: new OpenTelemetryLogFormatter(),
  });
};

export { createLogger, Logger, type Context };
export default createLogger();