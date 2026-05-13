const FEATURES = (process.env.TABLETAMER_FEATURES ?? 'datanorm,dedupe,filter,cancelation')
  .split(',')
  .map((s) => `test-cases/${s.trim()}.feature`);

const common = {
  paths: FEATURES,
  import: ['test-cases/step-defs/**/*.ts'],
};

export default common;

export const headless = {
  ...common,
  tags: '@headless',
  worldParameters: { surface: 'headless' },
};

export const cli = {
  ...common,
  tags: '@cli',
  worldParameters: { surface: 'cli' },
};
