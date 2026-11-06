param([Parameter(Mandatory=$true)][ValidatePattern('^vstudy-[a-f0-9]{32}$')][string]$PipeName)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Concurrent;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Threading;
using Microsoft.Win32.SafeHandles;

public static class VStudyPipeHost {
    [StructLayout(LayoutKind.Sequential)]
    struct SecurityAttributes { public int Length; public IntPtr Descriptor; public bool Inherit; }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern SafePipeHandle CreateNamedPipe(string name, uint mode, uint pipeMode, uint max,
        uint output, uint input, uint timeout, ref SecurityAttributes attributes);
    static readonly object OutputLock = new object();
    static readonly ConcurrentDictionary<string, Peer> Clients = new ConcurrentDictionary<string, Peer>();
    static SecurityIdentifier User;
    static byte[] Descriptor;
    static string Name;
    static volatile bool Stopping;
    static int Connections;

    sealed class Peer {
        public readonly NamedPipeServerStream Pipe;
        public readonly BlockingCollection<byte[]> Output = new BlockingCollection<byte[]>(32);
        public Peer(NamedPipeServerStream pipe) { Pipe = pipe; }
        public void Close() { Output.CompleteAdding(); Pipe.Dispose(); }
        public void Write() {
            try {
                foreach (byte[] bytes in Output.GetConsumingEnumerable()) {
                    Pipe.Write(bytes, 0, bytes.Length); Pipe.Flush();
                }
            } catch (IOException) {} catch (ObjectDisposedException) {}
            finally { Close(); }
        }
    }
    static void Emit(string message) {
        lock (OutputLock) { Console.Out.WriteLine(message); Console.Out.Flush(); }
    }
    static NamedPipeServerStream Create(bool first) {
        IntPtr descriptor = Marshal.AllocHGlobal(Descriptor.Length);
        try {
            Marshal.Copy(Descriptor, 0, descriptor, Descriptor.Length);
            SecurityAttributes attributes = new SecurityAttributes {
                Length = Marshal.SizeOf(typeof(SecurityAttributes)), Descriptor = descriptor, Inherit = false
            };
            // Reject remote clients, and fail startup if another process already owns this name.
            SafePipeHandle handle = CreateNamedPipe("\\\\.\\pipe\\" + Name,
                3u | 0x40000000u | (first ? 0x00080000u : 0u), 8u, 32u, 65536u, 65536u, 0u, ref attributes);
            if (handle.IsInvalid) { handle.Dispose(); throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()); }
            NamedPipeServerStream pipe = new NamedPipeServerStream(PipeDirection.InOut, true, false, handle);
            PipeSecurity acl = pipe.GetAccessControl();
            if (!acl.AreAccessRulesProtected || acl.GetOwner(typeof(SecurityIdentifier)).Value != User.Value) {
                pipe.Dispose(); throw new UnauthorizedAccessException();
            }
            int allowed = 0;
            foreach (PipeAccessRule rule in acl.GetAccessRules(true, true, typeof(SecurityIdentifier))) {
                if (rule.IsInherited || (rule.AccessControlType == AccessControlType.Allow && rule.IdentityReference.Value != User.Value)) {
                    pipe.Dispose(); throw new UnauthorizedAccessException();
                }
                if (rule.AccessControlType == AccessControlType.Allow) allowed++;
            }
            if (allowed != 1) { pipe.Dispose(); throw new UnauthorizedAccessException(); }
            return pipe;
        } finally { Marshal.FreeHGlobal(descriptor); }
    }
    static void Serve(object value) {
        NamedPipeServerStream pipe = (NamedPipeServerStream)value;
        string id = Guid.NewGuid().ToString("N");
        bool announced = false;
        Timer idle = new Timer(delegate { pipe.Dispose(); }, null, 90000, Timeout.Infinite);
        try {
            byte[] buffer = new byte[65536];
            // Reading is bounded. Nothing reaches the JSON parser until SID verification succeeds.
            int count = pipe.Read(buffer, 0, buffer.Length);
            if (count == 0) return;
            string peer = null;
            pipe.RunAsClient(delegate { peer = WindowsIdentity.GetCurrent().User.Value; });
            if (peer != User.Value || Stopping) return;
            Peer peerState = new Peer(pipe);
            Clients[id] = peerState;
            Thread writer = new Thread(peerState.Write); writer.IsBackground = true; writer.Start();
            Emit("open:" + id);
            announced = true;
            do {
                idle.Change(90000, Timeout.Infinite);
                Emit("data:" + id + ":" + Convert.ToBase64String(buffer, 0, count));
                count = pipe.Read(buffer, 0, buffer.Length);
            } while (count > 0 && !Stopping);
        } catch (IOException) {} catch (UnauthorizedAccessException) {} catch (ObjectDisposedException) {}
        finally {
            Peer removed;
            if (Clients.TryRemove(id, out removed)) removed.Close();
            idle.Dispose();
            pipe.Dispose();
            Interlocked.Decrement(ref Connections);
            if (announced) Emit("close:" + id);
        }
    }
    static void Listen(object initial) {
        NamedPipeServerStream next = (NamedPipeServerStream)initial;
        try {
            while (!Stopping) {
                next.WaitForConnection();
                NamedPipeServerStream connected = next;
                next = Create(false);
                if (Interlocked.Increment(ref Connections) > 31) {
                    Interlocked.Decrement(ref Connections); connected.Dispose(); continue;
                }
                ThreadPool.QueueUserWorkItem(Serve, connected);
            }
        } catch { if (!Stopping) Environment.Exit(1); }
        finally { next.Dispose(); }
    }
    public static void Run(string name) {
        Name = name;
        User = WindowsIdentity.GetCurrent().User;
        PipeSecurity security = new PipeSecurity();
        security.SetAccessRuleProtection(true, false);
        security.SetOwner(User);
        security.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(WellKnownSidType.NetworkSid, null), PipeAccessRights.FullControl, AccessControlType.Deny));
        security.AddAccessRule(new PipeAccessRule(User, PipeAccessRights.FullControl, AccessControlType.Allow));
        Descriptor = security.GetSecurityDescriptorBinaryForm();
        NamedPipeServerStream initial = Create(true);
        Thread listener = new Thread(Listen); listener.IsBackground = true; listener.Start(initial);
        Emit("ready:" + User.Value + ":" + Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(security.GetSecurityDescriptorSddlForm(AccessControlSections.All))));
        try {
            string line;
            while ((line = Console.In.ReadLine()) != null) {
                if (line.Length > 90000) throw new InvalidDataException();
                int split = line.IndexOf(':');
                if (split != 32) throw new InvalidDataException();
                Peer peer;
                if (!Clients.TryGetValue(line.Substring(0, split), out peer)) continue;
                string body = line.Substring(split + 1);
                if (body == "-") { peer.Close(); continue; }
                byte[] bytes = Convert.FromBase64String(body);
                try { if (!peer.Output.TryAdd(bytes)) peer.Close(); }
                catch (InvalidOperationException) { peer.Close(); }
            }
        } finally {
            Stopping = true;
            foreach (Peer peer in Clients.Values) peer.Close();
        }
    }
}
'@
[VStudyPipeHost]::Run($PipeName)
