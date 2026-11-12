# Простой локальный веб-сервер для запуска EcoTrack ATU без установки Node/Python.
# Запуск:  powershell -ExecutionPolicy Bypass -File serve.ps1   (затем откройте http://localhost:8080)
param([int]$Port = 8080)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "EcoTrack ATU: http://localhost:$Port/  (Ctrl+C - stop)"
$mime = @{
  '.html'='text/html; charset=utf-8'; '.js'='application/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8';
  '.json'='application/json; charset=utf-8'; '.webmanifest'='application/manifest+json'; '.svg'='image/svg+xml';
  '.png'='image/png'; '.jpg'='image/jpeg'; '.ico'='image/x-icon'; '.md'='text/plain; charset=utf-8';
  '.xlsx'='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; '.pdf'='application/pdf'
}
try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
      $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
      if ($path -eq '' -or $path.EndsWith('/')) { $path = $path + 'index.html' }
      $file = Join-Path $root $path
      $full = [IO.Path]::GetFullPath($file)
      if ($full.StartsWith($root) -and (Test-Path $full -PathType Leaf)) {
        $bytes = [IO.File]::ReadAllBytes($full)
        $ext = [IO.Path]::GetExtension($full).ToLower()
        $ctx.Response.ContentType = $(if ($mime[$ext]) { $mime[$ext] } else { 'application/octet-stream' })
        $ctx.Response.Headers.Add('Cache-Control', 'no-cache')
        $ctx.Response.ContentLength64 = $bytes.Length
        if ($ctx.Request.HttpMethod -ne 'HEAD') { $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length) }
      } else {
        $ctx.Response.StatusCode = 404
      }
    } catch { Write-Host "request error: $_" }
    try { $ctx.Response.Close() } catch {}
  }
} finally { $listener.Stop() }
