<# Disposable hosted-runner probe. Create an ordinary local identity, test the kernel DACL, then remove it. #>
param([Parameter(Mandatory=$true)][ValidatePattern('^vstudy-[a-f0-9]{32}$')][string]$PipeName)
$ErrorActionPreference = 'Stop'
if ($env:VSTUDY_WINDOWS_ACCOUNT_TEST -ne '1' -or $env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
    throw 'This probe requires explicit opt-in on a disposable GitHub-hosted runner'
}
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'The disposable runner must permit local-account creation'
}
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Principal;
using Microsoft.Win32.SafeHandles;
public static class VStudyForeignPipeProbe {
    [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern bool LogonUser(string name, string domain, string password, int type, int provider, out IntPtr token);
    [DllImport("advapi32.dll", SetLastError=true)] static extern bool ImpersonateLoggedOnUser(IntPtr token);
    [DllImport("advapi32.dll", SetLastError=true)] static extern bool RevertToSelf();
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern SafeFileHandle CreateFile(string path, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
    public static int Open(string name, string password, string expectedSid, string pipe) {
        string original = WindowsIdentity.GetCurrent().User.Value;
        IntPtr token;
        if (!LogonUser(name, ".", password, 2, 0, out token)) throw new Win32Exception(Marshal.GetLastWin32Error());
        bool impersonated = false;
        try {
            if (!ImpersonateLoggedOnUser(token)) throw new Win32Exception(Marshal.GetLastWin32Error());
            impersonated = true;
            WindowsIdentity current = WindowsIdentity.GetCurrent();
            if (current.User.Value == original || current.User.Value != expectedSid ||
                new WindowsPrincipal(current).IsInRole(WindowsBuiltInRole.Administrator)) throw new InvalidOperationException("Foreign ordinary-user identity was not established");
            using (SafeFileHandle handle = CreateFile("\\\\.\\pipe\\" + pipe, 0xc0020000u, 3u, IntPtr.Zero, 3u, 0x00110000u, IntPtr.Zero)) {
                return handle.IsInvalid ? Marshal.GetLastWin32Error() : 0;
            }
        } finally {
            if (impersonated && !RevertToSelf()) Environment.FailFast("Could not restore the test identity");
            CloseHandle(token);
        }
    }
}
'@
$name = 'vstudy-' + [Guid]::NewGuid().ToString('N').Substring(0, 12)
$random = [byte[]]::new(32)
$generator = [Security.Cryptography.RandomNumberGenerator]::Create()
$generator.GetBytes($random)
$generator.Dispose()
$password = [Convert]::ToBase64String($random) + 'Aa1!'
[Array]::Clear($random, 0, $random.Length)
$secure = ConvertTo-SecureString -String $password -AsPlainText -Force
$account = $null
$denied = $false
try {
    $account = New-LocalUser -Name $name -Password $secure -Description 'Disposable VStudy pipe isolation test'
    Add-LocalGroupMember -SID ([Security.Principal.SecurityIdentifier]::new('S-1-5-32-545')) -Member $account
    $errorCode = [VStudyForeignPipeProbe]::Open($name, $password, $account.SID.Value, $PipeName)
    if ($errorCode -ne 5) { throw "Expected ERROR_ACCESS_DENIED for a different ordinary user, received $errorCode" }
    $denied = $true
} finally {
    $password = $null
    $secure.Dispose()
    if ($null -ne $account) { Remove-LocalUser -SID $account.SID }
}
if ($null -ne (Get-LocalUser -SID $account.SID -ErrorAction SilentlyContinue)) { throw 'Temporary account was not removed' }
[pscustomobject]@{schemaVersion=1; differentUser=$true; administrator=$false; accessDenied=$denied; win32Error=5; accountRemoved=$true} | ConvertTo-Json -Compress
