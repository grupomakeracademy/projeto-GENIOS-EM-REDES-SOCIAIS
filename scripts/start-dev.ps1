if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    pnpm run dev
} else {
    $nodeDir = "C:\Users\User\AppData\Local\OpenAI\Codex\runtimes\cua_node\13827bafdc0b5422\bin"
    $shimDir = "C:\Users\User\AppData\Local\OpenAI\Codex\runtimes\cua_node\13827bafdc0b5422\bin\node_modules\corepack\shims"
    if (Test-Path $nodeDir) {
        $env:PATH = "$nodeDir;$shimDir;" + $env:PATH
        & "$shimDir\pnpm.cmd" run dev
    } else {
        npm run dev
    }
}

