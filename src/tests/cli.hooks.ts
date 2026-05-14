import { Before, type ITestCaseHookParameter } from '@cucumber/cucumber';
import { createCliRunner } from '@tabletamer/cli';
import { TableTamerWorld, runnerOptsFor } from './world.ts';

Before({ tags: '@cli' }, function (this: TableTamerWorld, scenario: ITestCaseHookParameter) {
  if (this.surface !== 'cli') return;
  this.runnerKind = 'cli';
  const opts = runnerOptsFor(scenario);
  this.runnerFactory = () => createCliRunner(opts);
});
