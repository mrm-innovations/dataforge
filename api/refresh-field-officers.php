<?php
// Admin-only endpoint to refresh the Field Officers directory via Google Sheets.
// Relies on scripts/fetch_field_officers.py to download + rebuild datasets/field-officers.{csv,json}

header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

$configPath = __DIR__ . '/config.php';
if (!file_exists($configPath)) {
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => 'Server not configured.']);
  exit;
}
require_once $configPath;

function unauthorized($msg = 'Unauthorized') {
  http_response_code(401);
  echo json_encode(['ok' => false, 'error' => $msg]);
  exit;
}

function server_error($msg) {
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => $msg]);
  exit;
}

if (!defined('API_TOKEN') || !API_TOKEN) {
  server_error('API token not configured.');
}
$token = '';
if (isset($_SERVER['HTTP_AUTHORIZATION']) && preg_match('/Bearer\s+(.*)/i', $_SERVER['HTTP_AUTHORIZATION'], $m)) {
  $token = trim($m[1]);
}
if (!$token && isset($_COOKIE['admin_token'])) {
  $token = (string)$_COOKIE['admin_token'];
}
if (!$token || !hash_equals(API_TOKEN, $token)) {
  unauthorized('Invalid token.');
}

if (!defined('FIELD_OFFICER_SHEET_ID') || !FIELD_OFFICER_SHEET_ID) {
  server_error('FIELD_OFFICER_SHEET_ID not set.');
}
$sheetId = FIELD_OFFICER_SHEET_ID;
$gid = defined('FIELD_OFFICER_SHEET_GID') ? FIELD_OFFICER_SHEET_GID : '0';
$python = defined('PYTHON_BIN') ? PYTHON_BIN : 'python';

$script = realpath(__DIR__ . '/../scripts/fetch_field_officers.py');
if ($script === false) {
  server_error('fetch_field_officers.py not found.');
}

$pythonEsc = escapeshellarg($python);
$scriptEsc = escapeshellarg($script);
$sheetEsc = escapeshellarg($sheetId);
$gidEsc = escapeshellarg((string)$gid);
$cmd = "$pythonEsc $scriptEsc --sheet-id $sheetEsc --gid $gidEsc";

$descriptor = [
  0 => ['pipe', 'r'],
  1 => ['pipe', 'w'],
  2 => ['pipe', 'w'],
];
$process = proc_open($cmd, $descriptor, $pipes, realpath(__DIR__ . '/..'));
if (!is_resource($process)) {
  server_error('Failed to start refresh process.');
}
fclose($pipes[0]);
$stdout = stream_get_contents($pipes[1]);
$stderr = stream_get_contents($pipes[2]);
fclose($pipes[1]);
fclose($pipes[2]);
$exit = proc_close($process);

if ($exit !== 0) {
  server_error("Refresh command failed (exit $exit): " . trim($stderr ?: $stdout));
}

echo json_encode([
  'ok' => true,
  'output' => trim($stdout),
]);
exit;
?>
