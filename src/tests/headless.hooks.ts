import { Before, type ITestCaseHookParameter } from '@cucumber/cucumber';
import { createHeadlessRunner } from '@tabletamer/headless';
import { TableTamerWorld, runnerOptsFor } from './world.ts';

Before({ tags: '@headless' }, function (this: TableTamerWorld, scenario: ITestCaseHookParameter) {
  if (this.surface !== 'headless') return;
  this.runnerKind = 'headless';
  const opts = runnerOptsFor(scenario);
  this.runnerFactory = () => createHeadlessRunner(opts);
});
