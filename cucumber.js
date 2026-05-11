const common = {
  paths: ['test-cases/**/*.feature'],
  import: ['test-cases/step-defs/**/*.ts'],
};

export default {
  default: common,
  headless: {
    ...common,
    tags: '@headless',
    worldParameters: { surface: 'headless' },
  },
  cli: {
    ...common,
    tags: '@cli',
    worldParameters: { surface: 'cli' },
  },
};
