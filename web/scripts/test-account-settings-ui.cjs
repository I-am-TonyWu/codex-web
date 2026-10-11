'use strict';
// Legacy entry point: account controls were removed in 1.4.3.11.
process.env.SETTINGS_TEST_URL ||= process.env.ACCOUNT_TEST_URL;
process.env.SETTINGS_SCREENSHOT_DIR ||= process.env.ACCOUNT_SCREENSHOT_DIR;
require('./test-connection-only-settings-ui.cjs');
