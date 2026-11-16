using System.Globalization;

namespace Savia.OpenXmlHelper.BlindCheck.Ooxml;

/// <summary>
/// Central OOXML conversions: one twip is 1/20 point; sz uses half-points;
/// spacing/@line uses 1/240 line for lineRule=auto and twips otherwise.
/// </summary>
static class Units
{
    public const double TwipsPerPt = 20.0;
    public const double TwipsPerCm = 1440.0 / 2.54;
    /// <summary>Convert each beforeLines/afterLines line as 12pt, matching the preview patch.</summary>
    public const double PtPerSpacingLine = 12.0;

    static readonly (string Name, double Pt)[] ChineseSizes =
    [
        ("初号", 42), ("小初", 36), ("一号", 26), ("小一", 24), ("二号", 22), ("小二", 18),
        ("三号", 16), ("小三", 15), ("四号", 14), ("小四", 12), ("五号", 10.5), ("小五", 9),
        ("六号", 7.5), ("小六", 6.5), ("七号", 5.5), ("八号", 5),
    ];

    public static double TwipsToPt(double twips) => twips / TwipsPerPt;

    public static double TwipsToCm(double twips) => twips / TwipsPerCm;

    public static double HalfPtToPt(double halfPoints) => halfPoints / 2.0;

    /// <summary>Convert points to the nearest Chinese size name; null if too far from a standard size.</summary>
    public static string? ChineseSizeName(double pt)
    {
        string? best = null;
        var bestDiff = double.MaxValue;
        foreach (var (name, value) in ChineseSizes)
        {
            var diff = Math.Abs(value - pt);
            if (diff < bestDiff)
            {
                best = name;
                bestDiff = diff;
            }
        }

        return bestDiff < 0.3 ? best : null;
    }

    /// <summary>Display 14pt with its Chinese size-four name; display nonstandard 13pt as points only.</summary>
    public static string FormatPt(double pt)
    {
        var name = ChineseSizeName(pt);
        var number = Number(pt);
        return name is null ? $"{number}磅" : $"{name}（{number}磅）";
    }

    public static string Number(double value, int digits = 2)
    {
        return Math.Round(value, digits).ToString("0.##", CultureInfo.InvariantCulture);
    }
}
