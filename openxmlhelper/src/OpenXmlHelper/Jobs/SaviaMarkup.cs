using System.Text;
using System.Text.RegularExpressions;

namespace Savia.OpenXmlHelper.Jobs;

/// <summary>Normalizes recognized document attributes without changing text or attribute values.</summary>
static class SaviaMarkup
{
    static readonly Regex Tags = new("<!--[\\s\\S]*?(?:-->|$)|<(?:[^>\"']|\"[^\"]*\"|'[^']*')*>", RegexOptions.CultureInvariant);
    static readonly Regex Attribute = new(@"\G(\s)data-[a-z]{2}-(asset-ref|generation|export-page-template|export-template|outline-number|row-even|preset|role|size|fit|rows)(?=\s*=)", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    public static string Normalize(string html) => Tags.Replace(html, match => NormalizeTag(match.Value));

    static string NormalizeTag(string tag)
    {
        if (tag.StartsWith("<!--", StringComparison.Ordinal)) return tag;
        var result = new StringBuilder(tag.Length);
        char quote = '\0';
        for (var i = 0; i < tag.Length; i++)
        {
            var current = tag[i];
            if (quote != '\0')
            {
                result.Append(current);
                if (current == quote) quote = '\0';
                continue;
            }
            if (current is '\"' or '\'') { quote = current; result.Append(current); continue; }
            if (char.IsWhiteSpace(current) && i + 6 <= tag.Length && tag.AsSpan(i + 1, 5).Equals("data-", StringComparison.OrdinalIgnoreCase))
            {
                var match = Attribute.Match(tag, i);
                if (match.Success && match.Index == i)
                {
                    result.Append(match.Groups[1].Value).Append("data-sv-").Append(match.Groups[2].Value);
                    i += match.Length - 1;
                    continue;
                }
            }
            result.Append(current);
        }
        return result.ToString();
    }
}
