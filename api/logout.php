<?php
header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

$secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443);
@setcookie('admin_token', '', [
  'expires' => time() - 3600,
  'path' => '/',
  'secure' => $secure,
  'httponly' => true,
  'samesite' => 'Strict',
]);

echo json_encode([ 'ok' => true ]);
exit;
?>

