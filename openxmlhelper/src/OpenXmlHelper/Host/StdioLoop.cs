using System.Text;
using Savia.OpenXmlHelper.Jobs;

namespace Savia.OpenXmlHelper.Host;

/// <summary>Read stdin and write stdout line by line to drive tasks.</summary>
static class StdioLoop
{
    /// <summary>Configure the console for UTF-8 without BOM and LF-only newlines.</summary>
    public static void ConfigureUtf8()
    {
        var utf8 = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false);
        Console.InputEncoding = utf8;
        Console.OutputEncoding = utf8;
        Console.SetIn(new StreamReader(Console.OpenStandardInput(), utf8, detectEncodingFromByteOrderMarks: false, bufferSize: 1024, leaveOpen: true));
        Console.SetOut(new StreamWriter(Console.OpenStandardOutput(), utf8, bufferSize: 1024, leaveOpen: true)
        {
            AutoFlush = true,
            NewLine = "\n",
        });
        Console.SetError(new StreamWriter(Console.OpenStandardError(), utf8, bufferSize: 1024, leaveOpen: true)
        {
            AutoFlush = true,
            NewLine = "\n",
        });
    }

    /// <summary>Process run signals until stdin closes.</summary>
    public static async Task RunAsync(JobRunner runner, CancellationToken cancellationToken = default)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            var line = await Console.In.ReadLineAsync(cancellationToken).ConfigureAwait(false);
            if (line is null)
            {
                break;
            }

            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            if (!SignalProtocol.TryParse(line, out var signal))
            {
                Console.Error.WriteLine("Unable to parse signal");
                continue;
            }

            if (!string.Equals(signal.Type, SignalProtocol.TypeRun, StringComparison.Ordinal))
            {
                Console.Error.WriteLine($"Ignoring signal type: {signal.Type}");
                continue;
            }

            if (!JobFolder.IsValidJobId(signal.Job))
            {
                Console.Error.WriteLine("Invalid job ID");
                if (!string.IsNullOrWhiteSpace(signal.Job))
                {
                    SignalProtocol.WriteDone(signal.Job, false);
                }

                continue;
            }

            var ok = runner.Run(signal.Job);
            SignalProtocol.WriteDone(signal.Job, ok);
        }
    }
}
