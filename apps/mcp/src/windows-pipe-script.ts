/** Authenticate the connected kernel pipe before starting the binary relay. Requires Windows PowerShell and .NET Framework. @packageDocumentation */
export const windowsPipeScript = String.raw`
$ErrorActionPreference = 'Stop'
$pipe = $null
$result = 2
try {
  $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  if ($sid.Value -ne $env:VSTUDY_PIPE_SID) { throw 'Wrong identity' }
  $rights = [System.IO.Pipes.PipeAccessRights]::ReadWrite -bor [System.IO.Pipes.PipeAccessRights]::ReadPermissions
  $pipe = [System.IO.Pipes.NamedPipeClientStream]::new('.', $env:VSTUDY_PIPE_NAME, $rights, [System.IO.Pipes.PipeOptions]::Asynchronous, [System.Security.Principal.TokenImpersonationLevel]::Identification, [System.IO.HandleInheritability]::None)
  try { $pipe.Connect(1000) }
  catch [System.TimeoutException] { $result = 3; throw }
  $acl = $pipe.GetAccessControl()
  if ($acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $sid.Value -or -not $acl.AreAccessRulesProtected) { throw 'Unsafe owner or ACL' }
  $raw = [System.Security.AccessControl.RawSecurityDescriptor]::new($acl.GetSecurityDescriptorBinaryForm(), 0)
  if ($raw.DiscretionaryAcl.Count -ne 2) { throw 'Unexpected ACEs' }
  for ($i = 0; $i -lt 2; $i++) {
    $ace = $raw.DiscretionaryAcl[$i]
    $expectedSid = $sid.Value
    $qualifier = [System.Security.AccessControl.AceQualifier]::AccessAllowed
    if ($i -eq 0) { $expectedSid = 'S-1-5-2'; $qualifier = [System.Security.AccessControl.AceQualifier]::AccessDenied }
    if (-not ($ace -is [System.Security.AccessControl.CommonAce]) -or $ace.IsCallback -or $ace.AceFlags -ne [System.Security.AccessControl.AceFlags]::None -or $ace.SecurityIdentifier.Value -ne $expectedSid -or $ace.AceQualifier -ne $qualifier -or $ace.AccessMask -ne [int][System.IO.Pipes.PipeAccessRights]::FullControl) { throw 'Unsafe ACE' }
  }
  $inputStream = [Console]::OpenStandardInput()
  $outputStream = [Console]::OpenStandardOutput()
  $ready = [System.Text.Encoding]::ASCII.GetBytes('VSTUDY_PIPE_READY:' + $sid.Value + [char]10)
  $outputStream.Write($ready, 0, $ready.Length)
  $outputStream.Flush()
  $up = $inputStream.CopyToAsync($pipe)
  $down = $pipe.CopyToAsync($outputStream)
  [void][System.Threading.Tasks.Task]::WaitAny([System.Threading.Tasks.Task[]]@($up, $down))
  $result = 0
} catch {} finally {
  if ($null -ne $pipe) { $pipe.Dispose() }
}
exit $result
`;
