import { Before } from '@cucumber/cucumber';
import { createHeadlessRunner } from '@tabletamer/headless';
import { TableTamerWorld } from './world.ts';

Before({ tags: '@headless' }, function (this: TableTamerWorld) {
  if (this.surface !== 'headless') return;
  this.runnerKind = 'headless';
  this.runnerFactory = () => createHeadlessRunner();
});
