import { Schema } from "effect";

const EnvironmentConfig = Schema.Struct({
  instanceId: Schema.String,
  region: Schema.String,
  autoStopSchedule: Schema.NullOr(Schema.String),
  autoStartSchedule: Schema.NullOr(Schema.String),
  autoStopStartSchedule: Schema.NullOr(Schema.String),
  monitorBucket: Schema.String,
  baseUrl: Schema.String,
  loginPath: Schema.String,
  welcomePath: Schema.String,
  clientProfilePath: Schema.String,
  collegePlannerPath: Schema.String,
  e2eTestSchedule: Schema.Array(Schema.String),
});

export const StackConfigSchema = Schema.Struct({
  awsSpecificCronValidator: Schema.String,
  uat: EnvironmentConfig,
  prod: EnvironmentConfig,
});
