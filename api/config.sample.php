<?php
// Copy this file to config.php and set credentials + strong random token.
// Never commit config.php to version control.

// Single admin account (for testing)
define('ADMIN_USER', 'admin');
// Generate hash with: php -r "echo password_hash('your-password', PASSWORD_DEFAULT);"
define('ADMIN_PASS_HASH', 'REPLACE_WITH_PASSWORD_HASH');

// Bearer token used by save-json endpoint
define('API_TOKEN', 'CHANGE_ME_TO_RANDOM_TOKEN');

// Google Sign-In not used in this setup. Leave unset.
// define('GOOGLE_CLIENT_ID', '');
// define('ALLOWED_GOOGLE_EMAILS', '');
?>
