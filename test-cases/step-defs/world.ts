import { setWorldConstructor, World as CucumberWorld, type IWorldOptions } from '@cucumber/cucumber';
import type { Row, Spec } from '@tabletamer/core';

export type RunnerKind = 'headless' | 'cli';

export interface Runner {
  loadInput(path: string): Promise<void>;
  request(text: string): Promise<void>;
  currentRows(): Row[];
  currentSpec(): Spec;
  exportAs(path: string): Promise<void>;
}

export class TableTamerWorld extends CucumberWorld {
  surface?: RunnerKind;
  inputPath?: string;
  goldenPath?: string;
  runnerKind?: RunnerKind;
  runner?: Runner;
  runnerFactory?: () => Runner;

  constructor(options: IWorldOptions) {
    super(options);
    const surface = (options.parameters as { surface?: unknown } | undefined)?.surface;
    if (surface === 'headless' || surface === 'cli') {
      this.surface = surface;
    }
  }

  ensureRunner(): Runner {
    if (this.runner) return this.runner;
    if (!this.runnerFactory) {
      throw new Error('No runner factory bound — did a per-tag Before hook run?');
    }
    this.runner = this.runnerFactory();
    return this.runner;
  }
}

setWorldConstructor(TableTamerWorld);
