const common = {
  paths: [
    'test-cases/datanorm.feature',
    'test-cases/dedupe.feature',
    'test-cases/filter.feature',
  ],
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
