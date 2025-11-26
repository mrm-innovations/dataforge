<?php
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

if (!defined('API_TOKEN') || !API_TOKEN) {
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => 'API token missing.']);
  exit;
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

$python = defined('PYTHON_BIN') ? PYTHON_BIN : 'python';
$script = realpath(__DIR__ . '/../scripts/fetch_audits.py');
if ($script === false) {
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => 'fetch_audits.py not found.']);
  exit;
}
$cmd = escapeshellarg($python) . ' ' . escapeshellarg($script);
$descriptor = [
  0 => ['pipe', 'r'],
  1 => ['pipe', 'w'],
  2 => ['pipe', 'w'],
];
$process = proc_open($cmd, $descriptor, $pipes, realpath(__DIR__ . '/..'));
if (!is_resource($process)) {
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => 'Failed to start refresh process.']);
  exit;
}
fclose($pipes[0]);
$stdout = stream_get_contents($pipes[1]);
$stderr = stream_get_contents($pipes[2]);
fclose($pipes[1]);
fclose($pipes[2]);
$exit = proc_close($process);
if ($exit !== 0) {
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => trim($stderr ?: $stdout)]);
  exit;
}
echo json_encode(['ok' => true, 'output' => trim($stdout)]);
exit;
?>
