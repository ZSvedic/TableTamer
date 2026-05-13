import { BeforeAll } from '@cucumber/cucumber';
import { loadEnv } from '@tabletamer/core';

BeforeAll(function () {
  loadEnv();
});
