import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';

export class AwsHonoStrandsAgentsExampleStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    cdk.RemovalPolicies.of(this).destroy();

    const functionName = 'aws-hono-strands-agents-lambda';
    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: `/aws/lambda/${functionName}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_DAY,
    });

    const fn = new nodejs.NodejsFunction(this, 'Lambda', {
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      entry: './lambda/index.ts',
      functionName,
      retryAttempts: 0,
      bundling: {
        banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);',
        minify: true,
        sourceMap: false,
        keepNames: false,
        format: nodejs.OutputFormat.ESM,
      },
      logGroup,
      memorySize: 256,
      timeout: cdk.Duration.minutes(1),
      role: new iam.Role(this, 'ApolloLambdaFunctionExecutionRole', {
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName('AWSLambdaExecute'),
          iam.ManagedPolicy.fromAwsManagedPolicyName('CloudFrontReadOnlyAccess'),
        ],
        inlinePolicies: {
          'bedrock-policy': new iam.PolicyDocument({
            statements: [
              new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                  'bedrock:InvokeModel*',
                  'logs:PutLogEvents',
                ],
                resources: ['*'],
              }),
            ],
          }),
        },
      }),
      loggingFormat: lambda.LoggingFormat.JSON,
    });
    fn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });
  }
}
