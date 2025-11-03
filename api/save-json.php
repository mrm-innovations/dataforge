<?php
// Simple authenticated endpoint to write JSON files to the webroot.
// Security: requires api/config.php with a strong API_TOKEN constant.
// Only allows writing whitelisted filenames.

header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

$configPath = __DIR__ . '/config.php';
if (!file_exists($configPath)) {
  http_response_code(500);
  echo json_encode([ 'ok' => false, 'error' => 'Server not configured. Copy api/config.sample.php to api/config.php and set API_TOKEN.' ]);
  exit;
}
require_once $configPath;

function unauthorized($msg = 'Unauthorized'){
  http_response_code(401);
  echo json_encode([ 'ok' => false, 'error' => $msg ]);
  exit;
}

$auth = isset($_SERVER['HTTP_AUTHORIZATION']) ? $_SERVER['HTTP_AUTHORIZATION'] : '';
if (!defined('API_TOKEN') || !API_TOKEN) {
  http_response_code(500);
  echo json_encode([ 'ok' => false, 'error' => 'API token not set on server.' ]);
  exit;
}
// Accept token from Authorization header (Bearer ...) or HttpOnly cookie 'admin_token'
$got = '';
if (preg_match('/Bearer\s+(.*)/i', $auth, $m)) { $got = trim($m[1]); }
if (!$got && isset($_COOKIE['admin_token'])) { $got = (string)$_COOKIE['admin_token']; }
if (!function_exists('hash_equals')) { function hash_equals($a,$b){ return $a === $b; } }
if (!$got || !hash_equals(API_TOKEN, $got)) unauthorized('Invalid token');

$fileRaw = isset($_GET['file']) ? (string)$_GET['file'] : '';
// Normalize and strictly validate allowed targets:
// - lg-audits.json
// - audits.config.json
// - datasets/<name>.json where <name> = [A-Za-z0-9_-]+
$fileNorm = ltrim(str_replace(['\\', '..'], ['/', ''], $fileRaw), '/');
$isFixed = ($fileNorm === 'lg-audits.json' || $fileNorm === 'audits.config.json' ||
            $fileNorm === 'dist/lg-audits.json' || $fileNorm === 'dist/audits.config.json');
$isDataset = preg_match('/^datasets\/[A-Za-z0-9_-]+\.json$/', $fileNorm) === 1;
if (!$isFixed && !$isDataset){
  http_response_code(400);
  echo json_encode([ 'ok' => false, 'error' => 'Invalid file parameter' ]);
  exit;
}

$raw = file_get_contents('php://input');
if ($raw === false) {
  http_response_code(400);
  echo json_encode([ 'ok' => false, 'error' => 'No request body' ]);
  exit;
}

// If body is JSON with { data: "..." }, unwrap, else accept raw as content
$content = $raw;
$decoded = json_decode($raw, true);
if (is_array($decoded) && array_key_exists('data', $decoded)) {
  $content = $decoded['data'];
}

// Basic sanity check: ensure content is valid JSON
json_decode($content);
if (json_last_error() !== JSON_ERROR_NONE){
  http_response_code(400);
  echo json_encode([ 'ok' => false, 'error' => 'Body must be valid JSON string content' ]);
  exit;
}

$target = realpath(__DIR__ . '/..');
if ($target === false) {
  http_response_code(500);
  echo json_encode([ 'ok' => false, 'error' => 'Failed to resolve webroot' ]);
  exit;
}
$path = $target . DIRECTORY_SEPARATOR . $fileNorm;
// Ensure directory exists for dataset files
$dir = dirname($path);
if (!is_dir($dir)) @mkdir($dir, 0755, true);
$ok = @file_put_contents($path, $content);
if ($ok === false) {
  http_response_code(500);
  echo json_encode([ 'ok' => false, 'error' => 'Write failed. Check permissions.' ]);
  exit;
}

// Return normalized path for clarity
echo json_encode([ 'ok' => true, 'path' => $fileNorm, 'bytes' => $ok ]);
exit;
?>
