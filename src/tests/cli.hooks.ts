import { Before } from '@cucumber/cucumber';
import { createCliRunner } from '@tabletamer/cli';
import { TableTamerWorld } from './world.ts';

Before({ tags: '@cli' }, function (this: TableTamerWorld) {
  if (this.surface !== 'cli') return;
  this.runnerKind = 'cli';
  this.runnerFactory = () => createCliRunner();
});
