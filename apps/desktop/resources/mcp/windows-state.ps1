<# Persist opaque MCP state only after checking a protected current-user ACL on its open handle. #>
param(
    [Parameter(Mandatory=$true)][string]$UserData,
    [Parameter(Mandatory=$true)][ValidateSet('read','write')][string]$Operation
)
$ErrorActionPreference = 'Stop'
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$maximum = 8 * 1024 * 1024
function Trace-Stage([string]$Stage) {
    if ($env:VSTUDY_STATE_FIXTURE_TRACE -eq '1') { [Console]::Error.WriteLine('state-stage ' + $Stage) }
}
Trace-Stage 'start'

function Assert-Path([string]$Path, [bool]$Directory) {
    $item = Get-Item -LiteralPath $Path -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0 -or $item.PSIsContainer -ne $Directory) { throw 'Unsafe path' }
}
function New-PrivateSecurity([bool]$Directory) {
    if ($Directory) { $acl = [System.Security.AccessControl.DirectorySecurity]::new() }
    else { $acl = [System.Security.AccessControl.FileSecurity]::new() }
    $acl.SetOwner($user)
    $acl.SetAccessRuleProtection($true, $false)
    $flags = [System.Security.AccessControl.InheritanceFlags]::None
    if ($Directory) { $flags = [System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit' }
    $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($user,
        [System.Security.AccessControl.FileSystemRights]::FullControl, $flags,
        [System.Security.AccessControl.PropagationFlags]::None,
        [System.Security.AccessControl.AccessControlType]::Allow))
    return $acl
}
function Assert-Private($Acl, [bool]$Directory) {
    if ($Acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $user.Value -or -not $Acl.AreAccessRulesProtected) { throw 'Unsafe owner or ACL' }
    $raw = [System.Security.AccessControl.RawSecurityDescriptor]::new($Acl.GetSecurityDescriptorBinaryForm(), 0)
    if ($raw.DiscretionaryAcl.Count -ne 1) { throw 'Unexpected ACL entry' }
    $ace = $raw.DiscretionaryAcl[0]
    $flags = [System.Security.AccessControl.AceFlags]::None
    if ($Directory) { $flags = [System.Security.AccessControl.AceFlags]'ContainerInherit, ObjectInherit' }
    if (-not ($ace -is [System.Security.AccessControl.CommonAce]) -or $ace.IsCallback -or
        $ace.SecurityIdentifier.Value -ne $user.Value -or
        $ace.AceQualifier -ne [System.Security.AccessControl.AceQualifier]::AccessAllowed -or
        $ace.AccessMask -ne [int][System.Security.AccessControl.FileSystemRights]::FullControl -or $ace.AceFlags -ne $flags) { throw 'Unsafe ACL entry' }
}
function Open-VerifiedState([string]$Path) {
    Assert-Path $Path $false
    $file = [System.IO.FileStream]::new($Path, [System.IO.FileMode]::Open,
        [System.IO.FileAccess]::Read,
        [System.IO.FileShare]::Read, 4096, [System.IO.FileOptions]::SequentialScan)
    try {
        Assert-Private ($file.GetAccessControl()) $false
        if ($file.Length -gt $maximum) { throw 'State exceeds limit' }
        return $file
    } catch { $file.Dispose(); throw }
}

if (-not [System.IO.Path]::IsPathRooted($UserData) -or $UserData -notmatch '^[A-Za-z]:\\' -or $UserData.Substring(2).Contains(':')) { throw 'Local drive path required' }
$parent = [System.IO.Path]::GetFullPath($UserData)
$cursor = $parent
while ($cursor) {
    Assert-Path $cursor $true
    $ancestor = [System.IO.Directory]::GetParent($cursor)
    if ($null -eq $ancestor) { break }
    $cursor = $ancestor.FullName
}
$directory = [System.IO.Path]::Combine($parent, 'mcp')
Trace-Stage 'ancestors-verified'
if (-not [System.IO.Directory]::Exists($directory)) {
    if ($Operation -eq 'read') { [Console]::Out.Write('missing'); exit 0 }
    [void][System.IO.Directory]::CreateDirectory($directory, (New-PrivateSecurity $true))
}
Assert-Path $directory $true
Assert-Private (Get-Acl -LiteralPath $directory) $true
Trace-Stage 'directory-verified'
$path = [System.IO.Path]::Combine($directory, 'state.json')
if ($Operation -eq 'read') {
    if (-not [System.IO.File]::Exists($path)) { [Console]::Out.Write('missing'); exit 0 }
    $file = Open-VerifiedState $path
    try {
        $bytes = [byte[]]::new([int]$file.Length)
        $offset = 0
        while ($offset -lt $bytes.Length) {
            $count = $file.Read($bytes, $offset, $bytes.Length - $offset)
            if ($count -eq 0) { throw 'Incomplete state read' }
            $offset += $count
        }
        [Console]::Out.Write('state:' + [Convert]::ToBase64String($bytes))
    } finally { $file.Dispose() }
    exit 0
}

Trace-Stage 'before-input'
$bytes = [Convert]::FromBase64String([Console]::In.ReadLine())
Trace-Stage 'input-read'
if ($bytes.Length -gt $maximum) { throw 'State exceeds limit' }
if ([System.IO.File]::Exists($path)) {
    $existing = Open-VerifiedState $path
    $existing.Dispose()
}
$temporary = [System.IO.Path]::Combine($directory, '.state-' + [Guid]::NewGuid().ToString('N') + '.tmp')
try {
    $file = [System.IO.FileStream]::new($temporary, [System.IO.FileMode]::CreateNew,
        [System.Security.AccessControl.FileSystemRights]'Write, ReadPermissions',
        [System.IO.FileShare]::None, 4096, [System.IO.FileOptions]::WriteThrough, (New-PrivateSecurity $false))
    try {
        Assert-Private ($file.GetAccessControl()) $false
        $file.Write($bytes, 0, $bytes.Length)
        $file.Flush($true)
        Trace-Stage 'file-flushed'
    } finally { $file.Dispose() }
    if ([System.IO.File]::Exists($path)) { [System.IO.File]::Replace($temporary, $path, $null) }
    else { [System.IO.File]::Move($temporary, $path) }
    Trace-Stage 'file-published'
    $published = Open-VerifiedState $path
    $published.Dispose()
    [Console]::Out.Write('ok')
} finally {
    [Array]::Clear($bytes, 0, $bytes.Length)
    if ([System.IO.File]::Exists($temporary)) { [System.IO.File]::Delete($temporary) }
}
