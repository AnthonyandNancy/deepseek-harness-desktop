using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;

internal static class WindowsHiddenConsole
{
    private const uint JobObjectLimitKillOnJobClose = 0x00002000;
    private const int JobObjectExtendedLimitInformation = 9;

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateJobObject(IntPtr jobAttributes, string name);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(
        IntPtr job,
        int informationClass,
        IntPtr information,
        uint informationLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);

    [StructLayout(LayoutKind.Sequential)]
    private struct IoCounters
    {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct BasicLimitInformation
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ExtendedLimitInformation
    {
        public BasicLimitInformation BasicLimitInformation;
        public IoCounters IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    private static int Main(string[] args)
    {
        if (args.Length == 0)
        {
            WriteError("Usage: windows-hidden-console.exe <program> [arguments...]");
            return 64;
        }

        try
        {
            return Run(args);
        }
        catch (Exception error)
        {
            WriteError(error.ToString());
            return 1;
        }
    }

    private static int Run(string[] args)
    {
        IntPtr job = CreateKillOnCloseJob();
        try
        {
            ProcessStartInfo startInfo = new ProcessStartInfo
            {
                FileName = args[0],
                Arguments = BuildArgumentString(args),
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = false,
                WindowStyle = ProcessWindowStyle.Hidden,
            };

            using (Process child = Process.Start(startInfo))
            {
                if (child == null)
                {
                    throw new InvalidOperationException("The child process did not start.");
                }

                if (!AssignProcessToJobObject(job, child.Handle))
                {
                    int error = Marshal.GetLastWin32Error();
                    child.Kill();
                    throw new Win32Exception(error, "AssignProcessToJobObject failed");
                }

                Stream output = Console.OpenStandardOutput();
                Stream errorOutput = Console.OpenStandardError();
                Task outputCopy = child.StandardOutput.BaseStream.CopyToAsync(output);
                Task errorCopy = child.StandardError.BaseStream.CopyToAsync(errorOutput);

                child.WaitForExit();
                Task.WaitAll(outputCopy, errorCopy);
                output.Flush();
                errorOutput.Flush();
                return child.ExitCode;
            }
        }
        finally
        {
            CloseHandle(job);
        }
    }

    private static IntPtr CreateKillOnCloseJob()
    {
        IntPtr job = CreateJobObject(IntPtr.Zero, null);
        if (job == IntPtr.Zero)
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "CreateJobObject failed");
        }

        ExtendedLimitInformation limits = new ExtendedLimitInformation();
        limits.BasicLimitInformation.LimitFlags = JobObjectLimitKillOnJobClose;
        int size = Marshal.SizeOf(typeof(ExtendedLimitInformation));
        IntPtr pointer = Marshal.AllocHGlobal(size);
        try
        {
            Marshal.StructureToPtr(limits, pointer, false);
            if (!SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                pointer,
                (uint)size))
            {
                int error = Marshal.GetLastWin32Error();
                CloseHandle(job);
                throw new Win32Exception(error, "SetInformationJobObject failed");
            }
        }
        finally
        {
            Marshal.FreeHGlobal(pointer);
        }

        return job;
    }

    private static string BuildArgumentString(string[] args)
    {
        StringBuilder command = new StringBuilder();
        for (int index = 1; index < args.Length; index++)
        {
            if (command.Length > 0)
            {
                command.Append(' ');
            }
            command.Append(QuoteArgument(args[index]));
        }
        return command.ToString();
    }

    private static string QuoteArgument(string argument)
    {
        if (argument.Length > 0
            && argument.IndexOfAny(new[] { ' ', '\t', '"' }) < 0)
        {
            return argument;
        }

        StringBuilder quoted = new StringBuilder("\"");
        int backslashes = 0;
        foreach (char character in argument)
        {
            if (character == '\\')
            {
                backslashes++;
                continue;
            }

            if (character == '"')
            {
                quoted.Append('\\', backslashes * 2 + 1);
                quoted.Append('"');
                backslashes = 0;
                continue;
            }

            quoted.Append('\\', backslashes);
            backslashes = 0;
            quoted.Append(character);
        }

        quoted.Append('\\', backslashes * 2);
        quoted.Append('"');
        return quoted.ToString();
    }

    private static void WriteError(string message)
    {
        byte[] bytes = Encoding.UTF8.GetBytes(message + Environment.NewLine);
        Stream error = Console.OpenStandardError();
        error.Write(bytes, 0, bytes.Length);
        error.Flush();
    }
}
