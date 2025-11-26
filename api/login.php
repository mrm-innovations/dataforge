<?php
// Simple login endpoint. Accepts JSON { username, password } and returns an API token if valid.
// Requires api/config.php to define ADMIN_USER, ADMIN_PASS_HASH, and API_TOKEN.

header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

$configPath = __DIR__ . '/config.php';
if (!file_exists($configPath)) {
  http_response_code(500);
  echo json_encode([ 'ok' => false, 'error' => 'Server not configured. Copy api/config.sample.php to api/config.php and set credentials.' ]);
  exit;
}
require_once $configPath;

function bad_request($msg){ http_response_code(400); echo json_encode([ 'ok' => false, 'error' => $msg ]); exit; }
function unauthorized($msg){ http_response_code(401); echo json_encode([ 'ok' => false, 'error' => $msg ]); exit; }

$raw = file_get_contents('php://input');
if ($raw === false) bad_request('No request body');
$data = json_decode($raw, true);
if (!is_array($data)) bad_request('Invalid JSON');
$u = isset($data['username']) ? (string)$data['username'] : '';
$p = isset($data['password']) ? (string)$data['password'] : '';
if ($u === '' || $p === '') bad_request('Missing username or password');

if (!defined('ADMIN_USER') || !defined('ADMIN_PASS_HASH') || !defined('API_TOKEN')) {
  http_response_code(500);
  echo json_encode([ 'ok' => false, 'error' => 'Server credentials not set.' ]);
  exit;
}
// Simple per-IP rate limiting: max 10 attempts per 10 minutes
$ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : 'unknown';
$rlDir = __DIR__ . '/.rate_limit';
@mkdir($rlDir, 0700, true);
$rlFile = $rlDir . '/' . preg_replace('/[^a-zA-Z0-9_.-]/','_', $ip) . '.json';
$now = time();
$bucket = [ 'ts' => [], 'blocked_until' => 0 ];
if (file_exists($rlFile)) {
  $dec = json_decode(@file_get_contents($rlFile), true);
  if (is_array($dec)) $bucket = array_merge($bucket, $dec);
}
// Clean old timestamps (>10 min)
$bucket['ts'] = array_values(array_filter($bucket['ts'], function($t) use ($now){ return ($now - (int)$t) < 600; }));
if ($bucket['blocked_until'] > $now) { unauthorized('Too many attempts. Try again later.'); }

$okUser = hash_equals((string)ADMIN_USER, (string)$u);
$okPass = password_verify($p, ADMIN_PASS_HASH);
if (!$okUser || !$okPass) {
  $bucket['ts'][] = $now;
  if (count($bucket['ts']) >= 10) { $bucket['blocked_until'] = $now + 300; } // 5 minutes block
  @file_put_contents($rlFile, json_encode($bucket));
  unauthorized('Invalid credentials');
}
// success: reset attempts
@file_put_contents($rlFile, json_encode([ 'ts' => [], 'blocked_until' => 0 ]));

// Set HttpOnly session cookie with the admin token (1 day validity)
$secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443);
@setcookie('admin_token', API_TOKEN, [
  'expires' => time() + 86400,
  'path' => '/',
  'secure' => $secure,
  'httponly' => true,
  'samesite' => 'Strict',
]);

echo json_encode([ 'ok' => true ]);
exit;
?>
