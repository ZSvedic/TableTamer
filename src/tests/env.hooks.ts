import { BeforeAll } from '@cucumber/cucumber';
import { loadEnv } from '@tamedtable/core';

BeforeAll(function () {
  loadEnv();
});
