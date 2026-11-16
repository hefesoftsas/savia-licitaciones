using System.IO.Compression;
using System.Text;
using System.Xml;
using System.Xml.Linq;

namespace Savia.OpenXmlHelper.BlindCheck.Ooxml;

/// <summary>
/// Write a repaired copy in original ZIP entry order, reserializing or replacing bytes only for changed parts;
/// copy images, embedded objects, and unchanged XML with their original decompressed contents.
/// </summary>
sealed class DocxWriter(DocxPackage source)
{
    static readonly XmlWriterSettings WriterSettings = new()
    {
        Encoding = new UTF8Encoding(false),
        Indent = false,
        CheckCharacters = false,
        NewLineHandling = NewLineHandling.None,
    };

    readonly Dictionary<string, XDocument> _xml = new(StringComparer.OrdinalIgnoreCase);
    readonly Dictionary<string, byte[]> _binary = new(StringComparer.OrdinalIgnoreCase);
    readonly Dictionary<string, XDocument> _relationships = new(StringComparer.OrdinalIgnoreCase);
    readonly HashSet<string> _removed = new(StringComparer.OrdinalIgnoreCase);

    public int ChangedParts => _xml.Count + _binary.Count + _relationships.Count + _removed.Count;

    public void SetXml(string part, XDocument document) => _xml[part] = document;

    public void SetBytes(string part, byte[] data) => _binary[part] = data;

    /// <summary>Remove parts no longer referenced by any relationship, such as company logos left after clearing headers.</summary>
    public void RemovePart(string part) => _removed.Add(part);

    /// <summary>Remove a part relationship, such as the URL after unlinking a hyperlink.</summary>
    public void RemoveRelationship(string part, string id)
    {
        var name = DocxPackage.RelsNameFor(part);
        if (!_relationships.TryGetValue(name, out var document))
        {
            document = source.Load(name);
            if (document is null) return;
            _relationships[name] = document;
        }

        document.Root?.Elements(W.PackageRel + "Relationship")
            .Where(item => item.Attribute("Id")?.Value == id)
            .Remove();
    }

    /// <summary>Whether this repair already removed the relationship; reference checks must use repaired relationships.</summary>
    public bool IsRelationshipRemoved(string part, string id)
    {
        return _relationships.TryGetValue(DocxPackage.RelsNameFor(part), out var document)
            && document.Root?.Elements(W.PackageRel + "Relationship").Any(item => item.Attribute("Id")?.Value == id) != true;
    }

    public void Save(string outputPath)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(outputPath)!);
        var temp = outputPath + ".tmp";
        using (var stream = File.Create(temp))
        using (var zip = new ZipArchive(stream, ZipArchiveMode.Create))
        {
            foreach (var name in source.EntryNames)
            {
                var key = name.Replace('\\', '/').TrimStart('/');
                if (_removed.Contains(key)) continue;
                var entry = zip.CreateEntry(name, CompressionLevel.Optimal);
                entry.LastWriteTime = source.LastWriteTime(name);
                using var output = entry.Open();
                if (_xml.TryGetValue(key, out var document) || _relationships.TryGetValue(key, out document))
                {
                    using var writer = XmlWriter.Create(output, WriterSettings);
                    document.Save(writer);
                }
                else if (_binary.TryGetValue(key, out var data))
                {
                    output.Write(data);
                }
                else
                {
                    using var input = source.OpenEntry(name);
                    input.CopyTo(output);
                }
            }
        }

        File.Move(temp, outputPath, overwrite: true);
    }
}
