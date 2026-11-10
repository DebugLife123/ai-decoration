#requires -Version 5.1
<#
.SYNOPSIS
    确保当前机器上有一份可用的 JDK 21，并把它的根目录打印到标准输出。

.DESCRIPTION
    CI 的后端验证任务需要 JDK 21，但 runner 主机上可能根本没装 Java
    （历史上就是这种情况：`java -version` 直接报「术语 'java' 不是 cmdlet」）。
    与其让流水线卡在「先找运维装 JDK」，这里让任务自己把 JDK 准备好：
    找不到就从下面的镜像下载一份解压到本机固定目录，以后一直复用。

    找到（或装好）之后，把 JDK 根目录作为标准输出的一行返回，调用方这样用：

        $jdk = & .\scripts\ensure-jdk21.ps1
        $env:JAVA_HOME = $jdk
        $env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

    进度信息走 Write-Host（信息流），不会被 $jdk 捕获，所以标准输出里只有路径。

.PARAMETER TargetDirectory
    JDK 解压到哪里。默认放到当前用户的 AppData 下（%LOCALAPPDATA%\dsh\jdk21），
    而不是仓库工作区里：一个 JDK 约 300MB，装一次就该一直用。
    放在工作区里的话，CI 每次都要靠 cache 搬来搬去（而且 git clean 会把它删掉），
    放在用户目录下则同一个 runner 上所有流水线共享，装一次就够。

.PARAMETER Force
    即使已经找到可用的 Java 也重新下载。用于验证下载链路是否通畅。

.EXAMPLE
    .\scripts\ensure-jdk21.ps1
#>
[CmdletBinding()]
param(
    [string] $TargetDirectory = (Join-Path $env:LOCALAPPDATA 'dsh\jdk21'),
    [switch] $Force,
    [int] $MinimumMajorVersion = 21
)

$ErrorActionPreference = 'Stop'

# 下载源按顺序尝试。都是 zip 包，解压后根目录里应该有一个 bin\java.exe。
# 前两个是 Adoptium 的国内镜像，只给到目录索引，需要先从索引里挑最新的 zip；
# 第三个是微软的固定短链，直接指向文件。
$IndexSources = @(
    'https://mirrors.tuna.tsinghua.edu.cn/Adoptium/21/jdk/x64/windows/',
    'https://mirrors.huaweicloud.com/adoptium/21/jdk/x64/windows/'
)
$DirectSources = @(
    'https://aka.ms/download-jdk/microsoft-jdk-21-windows-x64.zip'
)

function ConvertTo-MajorVersion {
    param([string] $VersionText)
    # 版本号形如 21.0.13 或 1.8.0_392。
    $m = [regex]::Match($VersionText, '^(\d+)(?:\.(\d+))?')
    if (-not $m.Success) { return $null }
    $major = [int] $m.Groups[1].Value
    # 老 JDK 写作 1.8.0，主版本其实是 8；21 之后都是 21、22 直给。
    if ($major -eq 1 -and $m.Groups[2].Success) { $major = [int] $m.Groups[2].Value }
    return $major
}

function Get-JavaMajorVersion {
    param([string] $JavaExe)

    # 优先读 JDK 根目录下的 release 文件（每个现代 JDK 都有，内容是 JAVA_VERSION="21.0.13"）。
    # 这样不用启动子进程，也就绕开了一个大坑：`java -version` 把版本号打在标准错误上，
    # 而本脚本全局 $ErrorActionPreference = 'Stop' 时，PowerShell 会把原生命令的
    # 一行 stderr 当成终止性错误，try/catch 直接拿到异常、正则根本没机会跑。
    $release = Join-Path (Split-Path -Parent (Split-Path -Parent $JavaExe)) 'release'
    if (Test-Path -LiteralPath $release) {
        $hit = Select-String -LiteralPath $release -Pattern '^JAVA_VERSION="([^"]+)"' -List
        if ($hit) { return (ConvertTo-MajorVersion -VersionText $hit.Matches[0].Groups[1].Value) }
    }

    # 兜底：release 文件缺失（老版本或残缺包）时才真的去跑 java -version，
    # 并且这一次要把错误偏好临时调回 Continue，否则上面说的 stderr 问题会再犯。
    try {
        $previous = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try {
            $raw = & $JavaExe -version 2>&1 | Out-String
        } finally {
            $ErrorActionPreference = $previous
        }
    } catch {
        return $null
    }
    $m = [regex]::Match($raw, 'version\s+"([^"]+)"')
    if (-not $m.Success) { return $null }
    return (ConvertTo-MajorVersion -VersionText $m.Groups[1].Value)
}

function Test-JdkRoot {
    param([string] $Root)
    if (-not $Root) { return $null }
    $exe = Join-Path $Root 'bin\java.exe'
    if (-not (Test-Path -LiteralPath $exe)) { return $null }
    $major = Get-JavaMajorVersion -JavaExe $exe
    if ($null -eq $major) { return $null }
    if ($major -lt $MinimumMajorVersion) {
        Write-Host "跳过 $Root（Java $major 低于要求的 $MinimumMajorVersion）"
        return $null
    }
    return $Root
}

function Find-ExistingJdk {
    # 1) PATH 上的 java：用它的上两级目录当 JAVA_HOME。
    $onPath = Get-Command java.exe -ErrorAction SilentlyContinue
    if ($onPath) {
        # 别用 $home 当变量名：它是 PowerShell 的只读自动变量，赋值会直接报
        # 「无法覆盖变量 HOME，因为该变量为只读变量或常量」。
        $javaRoot = Split-Path -Parent (Split-Path -Parent $onPath.Source)
        $found = Test-JdkRoot -Root $javaRoot
        if ($found) { return $found }
    }

    # 2) JAVA_HOME
    $found = Test-JdkRoot -Root $env:JAVA_HOME
    if ($found) { return $found }

    # 3) 常见安装位置。只认 jdk-21 这类目录名，避免把 JRE 或别的版本捡进来。
    $roots = @(
        (Join-Path $env:ProgramFiles 'Java'),
        (Join-Path $env:ProgramFiles 'Eclipse Adoptium'),
        (Join-Path $env:ProgramFiles 'Microsoft'),
        (Join-Path ${env:ProgramFiles(x86)} 'Java'),
        (Join-Path $env:LOCALAPPDATA 'Programs\Eclipse Adoptium'),
        'C:\Java',
        'D:\Java',
        'D:\Program Files\Java'
    )
    foreach ($root in $roots) {
        if (-not (Test-Path -LiteralPath $root)) { continue }
        # 先把候选目录收成数组再用 foreach 遍历，不要写管道 + ForEach-Object：
        # 在 ForEach-Object 的脚本块里 `return` 只结束当前这一次迭代、并不会结束
        # 整个函数，于是 Test-JdkRoot 的返回值会从管道里漏出去，把标准输出的
        # 「只有 JDK 路径一行」搞成多行。这也正是本脚本唯一允许写标准输出的地方。
        $candidates = @(Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match '(?i)^(jdk|jdk-)?21' })
        foreach ($candidate in $candidates) {
            $found = Test-JdkRoot -Root $candidate.FullName
            if ($found) { return $found }
        }
    }

    # 4) 之前由本脚本装到工作区里的那份
    $found = Test-JdkRoot -Root $TargetDirectory
    if ($found) { return $found }

    return $null
}

function Get-ZipCandidateUrl {
    param([string] $Source)

    if ($Source -like '*.zip') { return @($Source) }

    $response = Invoke-WebRequest -UseBasicParsing -Uri $Source -TimeoutSec 30
    $html = if ($response.Content -is [byte[]]) {
        [System.Text.Encoding]::UTF8.GetString($response.Content)
    } else {
        [string] $response.Content
    }
    # 索引页里的文件名形如 OpenJDK21U-jdk_x64_windows_hotspot_21.0.13_9.zip。
    # 同一目录下还有 .sha256.txt、debugimage、testimage 之类，只取主 zip。
    $names = [regex]::Matches($html, 'href="([^"]*OpenJDK21U-jdk_x64_windows_hotspot_[0-9._]+\.zip)"') |
        ForEach-Object { $_.Groups[1].Value }
    if (-not $names) { throw "索引页里没有找到 JDK 21 的 zip：$Source" }

    # 按文件名里的 build 号排序取最新。
    return @($names |
        Sort-Object {
            $n = [regex]::Match($_, 'hotspot_([0-9._]+)\.zip').Groups[1].Value
            [version] ($n -replace '_', '.')
        } -Descending |
        ForEach-Object {
            if ($_ -match '^https?://') { $_ } else { ([uri]::new([uri]$Source, $_)).AbsoluteUri }
        } |
        Select-Object -First 1)
}

function Install-Jdk {
    param([string] $Destination)

    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    $zipPath = Join-Path ([System.IO.Path]::GetTempPath()) ("jdk21-" + [guid]::NewGuid().ToString('N') + '.zip')

    $urls = @()
    foreach ($source in $IndexSources) {
        try { $urls += Get-ZipCandidateUrl -Source $source }
        catch { Write-Host "索引不可用（$source）：$($_.Exception.Message)" }
    }
    $urls += $DirectSources

    $downloaded = $false
    foreach ($url in $urls) {
        Write-Host "尝试从 $url 下载 JDK 21 ..."
        try {
            # ProgressPreference=SilentlyContinue 能显著加快 Invoke-WebRequest；
            # 不关掉的话一进度条就慢好几倍。
            $previous = $ProgressPreference
            $ProgressPreference = 'SilentlyContinue'
            try {
                Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $zipPath -TimeoutSec 900
            } finally {
                $ProgressPreference = $previous
            }
            $size = (Get-Item -LiteralPath $zipPath).Length
            if ($size -lt 50MB) { throw "下载到的文件只有 $size 字节，不像一个完整的 JDK 压缩包" }
            Write-Host ("下载完成：{0:N1} MB" -f ($size / 1MB))
            $downloaded = $true
            break
        } catch {
            Write-Host "下载失败：$($_.Exception.Message)"
            Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
        }
    }
    if (-not $downloaded) {
        throw @"
无法获取 JDK 21：所有下载源都失败了。
CI 需要 JDK 21，要么在 runner 主机上装好并加入 PATH（更省事），
要么确认 runner 能访问上面列出的镜像地址。
"@
    }

    $extractDir = Join-Path ([System.IO.Path]::GetTempPath()) ("jdk21-extract-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force -Path $extractDir | Out-Null
    try {
        Write-Host "解压到 $extractDir ..."
        Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir -Force
        $inner = Get-ChildItem -LiteralPath $extractDir -Directory | Select-Object -First 1
        if (-not $inner) { throw '压缩包解开后没有顶层目录，格式和预期不符' }
        if (Test-Path -LiteralPath $Destination) { Remove-Item -LiteralPath $Destination -Recurse -Force }
        Move-Item -LiteralPath $inner.FullName -Destination $Destination
    } finally {
        Remove-Item -LiteralPath $extractDir -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
    }

    $verified = Test-JdkRoot -Root $Destination
    if (-not $verified) { throw "装到 $Destination 之后仍然跑不起来，可能压缩包不完整" }
    return $verified
}

if (-not $Force) {
    $existing = Find-ExistingJdk
    if ($existing) {
        Write-Host "使用已有的 JDK：$existing"
        Write-Output $existing
        return
    }
}

Write-Host "没找到可用的 JDK $MinimumMajorVersion，开始下载。"
$installed = Install-Jdk -Destination $TargetDirectory
Write-Host "JDK $MinimumMajorVersion 已就绪：$installed"
Write-Output $installed
