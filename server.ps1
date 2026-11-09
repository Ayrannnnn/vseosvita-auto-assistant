# Всеосвіта Auto Assistant - локальный сервер отдачи скрипта
param(
    [int]$Port = 28878,
    [int]$TimeoutSeconds = 120
)

$scriptPath = Join-Path $PSScriptRoot "gemini-quiz-assistant.user.js"
if (-not (Test-Path $scriptPath)) {
    exit 1
}

$bytes = [System.IO.File]::ReadAllBytes($scriptPath)
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$Port/")

try {
    $listener.Start()
} catch {
    # Если порт занят, пробуем резервный
    $Port = 28879
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://127.0.0.1:$Port/")
    try {
        $listener.Start()
    } catch {
        exit 1
    }
}

$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$servedCount = 0

while ($stopwatch.Elapsed.TotalSeconds -lt $TimeoutSeconds -and $servedCount -lt 20) {
    $async = $listener.BeginGetContext($null, $null)
    $gotRequest = $async.AsyncWaitHandle.WaitOne(1000)
    if ($gotRequest) {
        try {
            $ctx = $listener.EndGetContext($async)
            $res = $ctx.Response
            $res.ContentType = "text/javascript; charset=utf-8"
            $res.Headers.Add("Access-Control-Allow-Origin", "*")
            $res.Headers.Add("Cache-Control", "no-cache, no-store, must-revalidate")
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
            $res.OutputStream.Close()
            $servedCount++
        } catch {}
    }
}

try {
    $listener.Stop()
    $listener.Close()
} catch {}
exit 0
