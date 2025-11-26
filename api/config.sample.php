<?php
// Copy this file to config.php and set credentials + strong random token.
// Never commit config.php to version control.

// Single admin account (for testing)
define('ADMIN_USER', 'admin');
// Generate hash with: php -r "echo password_hash('your-password', PASSWORD_DEFAULT);"
define('ADMIN_PASS_HASH', 'REPLACE_WITH_PASSWORD_HASH');

// Bearer token used by save-json endpoint
define('API_TOKEN', 'CHANGE_ME_TO_RANDOM_TOKEN');

// Optional: absolute path to python executable (defaults to "python")
// define('PYTHON_BIN', 'C:\\Python311\\python.exe');

// Field Officers directory (Google Sheet). Used by refresh-field-officers API.
// Set SHEET_ID from the sheet URL and optional gid (defaults to "0").
// define('FIELD_OFFICER_SHEET_ID', '1J8QksAsygyTmamYNV9Bsc3TusUgVvRKWexYQTHVzMQg');
// define('FIELD_OFFICER_SHEET_GID', '0');

// Local Officials directory (Google Sheet)
// define('LOCAL_OFFICIALS_SHEET_ID', '1gkIHGIp70gMSpX-1NYNc2wmoPTw46R7EOrdmPzLVYs8');
// define('LOCAL_OFFICIALS_SHEET_GID', '0');

// Demography (LGU profile) Google Sheet
// define('DEMOGRAPHY_SHEET_ID', '1AuXsBrc7r_s9bfhg7JPrq1MiJKO8jmDYgIeXR-MiYcc');
// define('DEMOGRAPHY_SHEET_GID', '0');

// Google Sign-In not used in this setup. Leave unset.
// define('GOOGLE_CLIENT_ID', '');
// define('ALLOWED_GOOGLE_EMAILS', '');
?>
