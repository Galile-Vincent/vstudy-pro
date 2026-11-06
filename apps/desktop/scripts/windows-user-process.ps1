# Run CI installer verification with a restricted current-user token instead of the hosted runner's administrator token.
param([Parameter(Mandatory)][string]$Executable, [Parameter(Mandatory)][string]$Script,
      [Parameter(Mandatory)][string]$Target, [Parameter(Mandatory)][string]$Output)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
public static class DistributionUserProcess {
  [StructLayout(LayoutKind.Sequential)] struct SidAttributes { public IntPtr Sid; public uint Attributes; }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct StartupInfo {
    public uint cb; public string reserved, desktop, title; public uint x, y, width, height, charsX, charsY, fill, flags;
    public ushort show, reserved2; public IntPtr reservedBytes, stdin, stdout, stderr;
  }
  [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr process, thread; public uint processId, threadId; }
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int kind);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr memory);
  [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr handle, out uint code);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateProcess(IntPtr handle, uint code);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool ConvertStringSidToSid(string text, out IntPtr sid);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool CreateRestrictedToken(IntPtr existing, uint flags, uint count,
    [In] SidAttributes[] disabled, uint deleteCount, IntPtr deleted, uint restrictCount, IntPtr restricted, out IntPtr token);
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool CreateProcessAsUser(IntPtr token,
    string application, StringBuilder command, IntPtr processAttributes, IntPtr threadAttributes, bool inherit, uint flags,
    IntPtr environment, string directory, ref StartupInfo startup, out ProcessInfo process);
  static void Check(bool success) { if (!success) throw new Win32Exception(Marshal.GetLastWin32Error()); }
  static string Quote(string value) {
    if (value.IndexOfAny(new char[] {'"', '\r', '\n', '\0'}) >= 0) throw new ArgumentException("Unsafe process argument");
    return "\"" + value.TrimEnd('\\') + "\"";
  }
  public static int Run(string executable, string script, string target, string output) {
    IntPtr source = IntPtr.Zero, token = IntPtr.Zero, administrators = IntPtr.Zero;
    ProcessInfo process = new ProcessInfo();
    try {
      Check(OpenProcessToken(GetCurrentProcess(), 0x02000000, out source));
      Check(ConvertStringSidToSid("S-1-5-32-544", out administrators));
      Check(CreateRestrictedToken(source, 0x1 | 0x4, 1,
        new SidAttributes[] { new SidAttributes { Sid = administrators } }, 0, IntPtr.Zero, 0, IntPtr.Zero, out token));
      StartupInfo startup = new StartupInfo(); startup.cb = (uint)Marshal.SizeOf(startup);
      startup.flags = 0x100; startup.stdin = GetStdHandle(-10); startup.stdout = GetStdHandle(-11); startup.stderr = GetStdHandle(-12);
      StringBuilder command = new StringBuilder(Quote(executable) + " " + Quote(script) + " --user-token --target " + Quote(target) + " --output " + Quote(output));
      Check(CreateProcessAsUser(token, executable, command, IntPtr.Zero, IntPtr.Zero, true, 0, IntPtr.Zero,
        Environment.CurrentDirectory, ref startup, out process));
      uint wait = WaitForSingleObject(process.process, 600000);
      if (wait == 258) { TerminateProcess(process.process, 124); throw new TimeoutException("Restricted installer smoke exceeded ten minutes"); }
      if (wait != 0) throw new Win32Exception(Marshal.GetLastWin32Error());
      uint code; Check(GetExitCodeProcess(process.process, out code)); return (int)code;
    } finally {
      if (process.thread != IntPtr.Zero) CloseHandle(process.thread);
      if (process.process != IntPtr.Zero) CloseHandle(process.process);
      if (token != IntPtr.Zero) CloseHandle(token);
      if (source != IntPtr.Zero) CloseHandle(source);
      if (administrators != IntPtr.Zero) LocalFree(administrators);
    }
  }
}
'@
exit [DistributionUserProcess]::Run($Executable, $Script, $Target, $Output)
