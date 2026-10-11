/** @type {import('@cucumber/cucumber').IConfiguration} */
export default {
  paths: ['features/**/*.feature'],
  import: ['features/support/**/*.ts', 'features/steps/**/*.ts'],
  format: ['progress', 'html:reports/cucumber.html'],
};
