using System.Globalization;
using System.Text.Json;
using AngleSharp.Dom;
using AngleSharp.Html.Parser;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using A = DocumentFormat.OpenXml.Drawing;
using DW = DocumentFormat.OpenXml.Drawing.Wordprocessing;
using PIC = DocumentFormat.OpenXml.Drawing.Pictures;
using Wps = DocumentFormat.OpenXml.Office2010.Word.DrawingShape;
using Wp = DocumentFormat.OpenXml.Wordprocessing;

namespace Savia.OpenXmlHelper.Jobs;

/// <summary>Generate a directly previewable Word document from restricted HTML and export-format settings.</summary>
static class RestrictedHtmlDocumentRenderer
{
    const string HeadingMarker = "SAVIAHEADING";
    const string TableCaptionMarker = "SAVIATABLECAPTION:";
    const string FigureCaptionMarker = "SAVIAFIGURECAPTION:";
    const string UnorderedListMarker = "SAVIALISTU:";
    const string OrderedListMarker = "SAVIALISTO:";

    static readonly IReadOnlyDictionary<string, (double Width, double Height)> PaperSizes =
        new Dictionary<string, (double Width, double Height)>(StringComparer.OrdinalIgnoreCase)
        {
            ["a4"] = (210, 297),
            ["a3"] = (297, 420),
            ["a5"] = (148, 210),
            ["b4"] = (250, 353),
            ["b5"] = (176, 250),
            ["letter"] = (215.9, 279.4),
            ["legal"] = (215.9, 355.6),
            ["16k"] = (184, 260),
        };

    static readonly IReadOnlyDictionary<string, double> ChineseFontSizes =
        new Dictionary<string, double>(StringComparer.Ordinal)
        {
            ["初号"] = 42,
            ["小初"] = 36,
            ["一号"] = 26,
            ["小一"] = 24,
            ["二号"] = 22,
            ["小二"] = 18,
            ["三号"] = 16,
            ["小三"] = 15,
            ["四号"] = 14,
            ["小四"] = 12,
            ["五号"] = 10.5,
            ["小五"] = 9,
            ["六号"] = 7.5,
            ["小六"] = 6.5,
        };

    // Sample HTML is constant, so reparsing on every setting change is wasteful; retain only the latest parse and clone before rewriting.
    static string _parsedHtmlSource = "";
    static IDocument? _parsedHtml;

    /// <summary>One sample-render result: block count, paragraph roles in document order, and images replaced by text notices.</summary>
    public readonly record struct RenderResult(int BlockCount, IReadOnlyList<string> ParagraphRoles, IReadOnlyList<ImageWarning> ImageWarnings);

    /// <summary>Create the skeleton, write HTML body content directly, then apply template formatting consistently.</summary>
    public static RenderResult Render(
        string assetRoot,
        string outputPath,
        string html,
        JsonElement exportFormat,
        ChromeAssets? chrome = null,
        bool wholeDocument = false,
        IReadOnlyDictionary<string, string>? assetTypes = null)
    {
        chrome ??= ChromeAssets.Empty;
        var assets = new FigureAssets(assetTypes);
        if (wholeDocument) return RenderWholeDocument(assetRoot, outputPath, html, exportFormat, chrome, assets);
        var format = new FormatReader(exportFormat);
        var prepared = PrepareHtml(html, format);
        Directory.CreateDirectory(Path.GetDirectoryName(outputPath)!);
        if (File.Exists(outputPath)) File.Delete(outputPath);

        using var document = WordprocessingDocument.Create(outputPath, WordprocessingDocumentType.Document);
        CreateSkeleton(document, format, chrome);
        var mainPart = document.MainDocumentPart!;
        // Samples are temporary derived files; the formal body-insertion path still performs complete validation.
        var blockCount = RestrictedHtmlWordInserter.InsertIntoContent(
            assetRoot,
            mainPart,
            mainPart.Document.Body!,
            format.Number(format.Section("image"), "max_width_percent", 90),
            prepared.Document,
            assets,
            cacheAssets: true);
        ApplyFormatting(document, format, prepared.Tables);
        return new RenderResult(blockCount, CollectParagraphRoles(document), assets.Warnings);
    }

    /// <summary>Convert style ranges within one Word package, sharing image relationships; create sections only when page ranges change.</summary>
    static RenderResult RenderWholeDocument(string assetRoot, string outputPath, string html, JsonElement exportFormat, ChromeAssets chrome, FigureAssets assets)
    {
        var format = new FormatReader(exportFormat);
        var basicPage = new Dictionary<string, JsonElement>();
        foreach (var name in new[] { "paper_size", "orientation", "two_column", "margin_top_cm", "margin_bottom_cm", "margin_left_cm", "margin_right_cm" })
        {
            if (format.Section("page").TryGetProperty(name, out var value)) basicPage[name] = value;
        }
        var basic = new FormatReader(JsonSerializer.SerializeToElement(new { page = basicPage }));
        var ranges = ParseHtml(html).Body!.Children.ToList();
        Directory.CreateDirectory(Path.GetDirectoryName(outputPath)!);
        using var document = WordprocessingDocument.Create(outputPath, WordprocessingDocumentType.Document);
        // Default styles retain base values; selected paragraphs carry template fonts through direct formatting.
        CreateSkeleton(document, basic, ChromeAssets.Empty);
        var mainPart = document.MainDocumentPart!;
        var body = mainPart.Document!.Body!;
        var result = new List<OpenXmlElement>();
        var blockCount = 0;
        var index = 0;
        while (index < ranges.Count)
        {
            var pageTemplate = ranges[index].GetAttribute("data-sv-export-page-template") == "true";
            var pageFormat = pageTemplate ? format : basic;
            // Different-first-page is reserved for covers; whole-document export does not yet support covers, so leave this setting unapplied.
            var section = CreateSectionProperties(mainPart, pageFormat, pageTemplate ? chrome : ChromeAssets.Empty, firstPageDifferent: false);
            AddEmptyChromeReferences(mainPart, section);
            section.RemoveAllChildren<Wp.PageNumberType>();
            if (result.Count == 0 && format.Bool(format.Section("page"), "page_number_enabled", false))
                section.AddChild(new Wp.PageNumberType { Start = Math.Max(1, format.Integer(format.Section("page"), "page_number_start", 1)) }, true);
            var pageElements = new List<OpenXmlElement>();
            do
            {
                var range = ranges[index++];
                var rangeFormat = range.GetAttribute("data-sv-export-template") == "true" ? format : basic;
                body.RemoveAllChildren();
                body.AppendChild(section.CloneNode(true));
                var prepared = PrepareHtml(range.InnerHtml, rangeFormat, outlineOnly: true);
                blockCount += RestrictedHtmlWordInserter.InsertIntoContent(assetRoot, mainPart, body,
                    rangeFormat.Number(rangeFormat.Section("image"), "max_width_percent", 90), prepared.Document, assets, cacheAssets: true);
                ApplyLayoutBookmarks(body, result.Concat(pageElements).SelectMany(item => item.Descendants<Wp.BookmarkStart>()).Count());
                ApplyFormatting(document, rangeFormat, prepared.Tables, rangeOnly: true);
                foreach (var element in body.ChildElements.Where(item => item is not Wp.SectionProperties).ToList())
                {
                    element.Remove();
                    pageElements.Add(element);
                }
            }
            while (index < ranges.Count && (ranges[index].GetAttribute("data-sv-export-page-template") == "true") == pageTemplate);

            body.RemoveAllChildren();
            body.Append(pageElements);
            body.AppendChild(section);
            if (!ChapterFrameEnabled(pageFormat)) ApplyTwoColumnHeadingSections(mainPart, body, pageFormat);
            RemoveLeadingPageBreak(body);
            // Parent headings and body text remain continuous within a page range; start a new page only when template pages change.
            if (index < ranges.Count)
            {
                section.Remove();
                SetSingleChild(section, new Wp.SectionType { Val = Wp.SectionMarkValues.NextPage });
                body.AppendChild(new Wp.Paragraph(new Wp.ParagraphProperties(section)));
            }
            foreach (var element in body.ChildElements.ToList())
            {
                element.Remove();
                result.Add(element);
            }
        }
        body.Append(result);
        // Image IDs restart within each converted range; normalize drawing IDs across the document and headers/footers after assembly.
        uint drawingId = 1;
        var roots = new OpenXmlElement[] { mainPart.Document }
            .Concat(mainPart.HeaderParts.Select(part => (OpenXmlElement)part.Header))
            .Concat(mainPart.FooterParts.Select(part => (OpenXmlElement)part.Footer));
        foreach (var root in roots)
        {
            foreach (var drawing in root.Descendants<DW.DocProperties>()) drawing.Id = drawingId++;
        }
        mainPart.Document.Save();
        foreach (var part in mainPart.HeaderParts) part.Header.Save();
        foreach (var part in mainPart.FooterParts) part.Footer.Save();
        return new RenderResult(blockCount, CollectParagraphRoles(document), assets.Warnings);
    }

    /// <summary>Convert internal locator paragraphs to zero-width bookmarks without visible body content or pagination changes.</summary>
    static void ApplyLayoutBookmarks(Wp.Body body, int bookmarkId)
    {
        static bool IsMarker(Wp.Paragraph paragraph) => paragraph.InnerText.StartsWith("SAVIALAYOUT:yb_layout_", StringComparison.Ordinal)
            || paragraph.InnerText.StartsWith("SAVIALAYOUT:st_", StringComparison.Ordinal);
        foreach (var marker in body.Elements<Wp.Paragraph>().Where(IsMarker).ToList())
        {
            var next = marker.NextSibling();
            while (next is Wp.Paragraph paragraph && IsMarker(paragraph)) next = next.NextSibling();
            var target = next as Wp.Paragraph ?? next?.Descendants<Wp.Paragraph>().FirstOrDefault();
            if (target is null) throw new InvalidOperationException("格式自检书签缺少对应正文块");
            var id = (bookmarkId++).ToString(CultureInfo.InvariantCulture);
            var start = new Wp.BookmarkStart { Id = id, Name = marker.InnerText["SAVIALAYOUT:".Length..] };
            if (target.ParagraphProperties is { } properties) target.InsertAfter(start, properties);
            else target.PrependChild(start);
            target.InsertAfter(new Wp.BookmarkEnd { Id = id }, start);
            marker.Remove();
        }
    }

    /// <summary>Undecorated ranges explicitly reference empty headers/footers so Word does not inherit the previous section's.</summary>
    static void AddEmptyChromeReferences(MainDocumentPart mainPart, Wp.SectionProperties section)
    {
        if (!section.Elements<Wp.HeaderReference>().Any())
        {
            var part = mainPart.AddNewPart<HeaderPart>();
            part.Header = new Wp.Header(new Wp.Paragraph());
            part.Header.Save();
            section.PrependChild(new Wp.HeaderReference { Id = mainPart.GetIdOfPart(part), Type = Wp.HeaderFooterValues.Default });
        }
        if (!section.Elements<Wp.FooterReference>().Any())
        {
            var part = mainPart.AddNewPart<FooterPart>();
            part.Footer = new Wp.Footer(new Wp.Paragraph());
            part.Footer.Save();
            section.InsertBefore(new Wp.FooterReference { Id = mainPart.GetIdOfPart(part), Type = Wp.HeaderFooterValues.Default },
                section.ChildElements.FirstOrDefault(item => item is not Wp.HeaderReference));
        }
    }

    /// <summary>Copy numbering definitions for the current range so template changes do not affect numbering shared by other ranges.</summary>
    static HashSet<int> IsolateNumbering(MainDocumentPart mainPart, Wp.Body body)
    {
        var numbering = mainPart.NumberingDefinitionsPart?.Numbering;
        var abstractIds = new HashSet<int>();
        if (numbering is null) return abstractIds;
        var nextAbstract = numbering.Elements<Wp.AbstractNum>().Select(item => item.AbstractNumberId!.Value).DefaultIfEmpty(-1).Max() + 1;
        var nextNumber = numbering.Elements<Wp.NumberingInstance>().Select(item => item.NumberID!.Value).DefaultIfEmpty(0).Max() + 1;
        foreach (var group in body.Descendants<Wp.NumberingId>().GroupBy(item => item.Val!.Value).ToList())
        {
            var instance = numbering.Elements<Wp.NumberingInstance>().First(item => item.NumberID!.Value == group.Key);
            var source = numbering.Elements<Wp.AbstractNum>().First(item => item.AbstractNumberId!.Value == instance.AbstractNumId!.Val!.Value);
            var clone = (Wp.AbstractNum)source.CloneNode(true);
            clone.AbstractNumberId = nextAbstract++;
            // HtmlToOpenXml indexes built-in lists by name; copies must not retain the disc/decimal names.
            clone.AbstractNumDefinitionName = new Wp.AbstractNumDefinitionName { Val = $"savia-range-{clone.AbstractNumberId}" };
            numbering.InsertBefore(clone, numbering.Elements<Wp.NumberingInstance>().First());
            var number = (Wp.NumberingInstance)instance.CloneNode(true);
            number.NumberID = nextNumber++;
            number.AbstractNumId!.Val = clone.AbstractNumberId;
            numbering.AppendChild(number);
            abstractIds.Add(clone.AbstractNumberId!.Value);
            foreach (var reference in group) reference.Val = number.NumberID;
        }
        return abstractIds;
    }

    /// <summary>
    /// List every body paragraph's role in document order.
    /// The preview editor enumerates paragraphs in the same order, aligning both sides by index,
    /// so include table-cell paragraphs and preserve the final XML order exactly.
    /// </summary>
    static IReadOnlyList<string> CollectParagraphRoles(WordprocessingDocument document)
    {
        var content = document.MainDocumentPart?.Document.Body;
        if (content is null) return [];

        var roles = new List<string>();
        foreach (var paragraph in content.Descendants<Wp.Paragraph>())
        {
            var styleId = paragraph.ParagraphProperties?.ParagraphStyleId?.Val?.Value ?? "";
            roles.Add(styleId.StartsWith("Heading", StringComparison.Ordinal)
                ? styleId.ToLowerInvariant()
                : "other");
        }
        return roles;
    }

    /// <summary>Parse sample HTML; reuse the previous parse for identical source and return an independent copy each time.</summary>
    static IDocument ParseHtml(string html)
    {
        if (_parsedHtml is null || !string.Equals(_parsedHtmlSource, html, StringComparison.Ordinal))
        {
            _parsedHtml = new HtmlParser().ParseDocument(SaviaMarkup.Normalize(html));
            _parsedHtmlSource = html;
        }

        return (IDocument)_parsedHtml.Clone(true);
    }

    /// <summary>Add temporary markers to headings, lists, and captions for precise Word post-processing.</summary>
    static PreparedHtml PrepareHtml(string html, FormatReader format, bool outlineOnly = false)
    {
        var document = ParseHtml(html);
        var counters = new int[6];
        foreach (var heading in document.QuerySelectorAll("h1,h2,h3,h4,h5,h6"))
        {
            var level = int.Parse(heading.LocalName[1..], CultureInfo.InvariantCulture);
            counters[level - 1] += 1;
            Array.Clear(counters, level, counters.Length - level);
            var outlineNumber = heading.GetAttribute("data-sv-outline-number");
            var number = outlineOnly
                ? (outlineNumber is null ? "" : FormatHeadingNumber(outlineNumber.Split('.').Select(int.Parse).ToArray(), format.Heading(level)))
                : FormatHeadingNumber(counters[..level], format.Heading(level));
            if (outlineOnly && outlineNumber is not null && format.Heading(level).ValueKind == JsonValueKind.Undefined) number = outlineNumber;
            var separator = number.Length > 0 && NeedsSpace(number) ? " " : "";
            heading.InsertBefore(
                document.CreateTextNode($"{HeadingMarker}{level}:{number}{separator}"),
                heading.FirstChild);
        }

        foreach (var item in document.QuerySelectorAll("li"))
        {
            var marker = item.ParentElement?.LocalName == "ol" ? OrderedListMarker : UnorderedListMarker;
            item.InsertBefore(document.CreateTextNode(marker), item.FirstChild);
        }

        var tables = document.QuerySelectorAll("table").Select(ReadTableSpec).ToList();
        foreach (var table in document.QuerySelectorAll("table").ToList())
        {
            var caption = table.Children.FirstOrDefault(item => item.LocalName == "caption");
            if (caption is null) continue;
            var paragraph = document.CreateElement("p");
            paragraph.TextContent = $"{TableCaptionMarker}{caption.TextContent.Trim()}";
            table.ParentElement?.InsertBefore(paragraph, table);
            caption.Remove();
        }

        foreach (var caption in document.QuerySelectorAll("figcaption"))
        {
            caption.TextContent = $"{FigureCaptionMarker}{caption.TextContent.Trim()}";
        }

        return new PreparedHtml(document, tables);
    }

    /// <summary>Record row/column roles for each source table to apply cell styles after conversion.</summary>
    static TableSpec ReadTableSpec(IElement table)
    {
        var rows = new List<(IElement Row, bool IsHeaderRow)>();
        foreach (var child in table.Children)
        {
            if (child.LocalName == "tr") rows.Add((child, false));
            else if (child.LocalName is "thead" or "tbody" or "tfoot")
            {
                rows.AddRange(child.Children
                    .Where(item => item.LocalName == "tr")
                    .Select(item => (item, child.LocalName == "thead")));
            }
        }

        return new TableSpec(rows.Select(source =>
            new TableRowSpec(source.IsHeaderRow, source.Row.Children
                .Where(item => item.LocalName is "th" or "td")
                .Select(cell => ResolveCellRole(cell, source.IsHeaderRow))
                .ToList())).ToList());
    }

    static CellRole ResolveCellRole(IElement cell, bool isHeaderRow)
    {
        var scope = cell.GetAttribute("scope") ?? "";
        if (isHeaderRow || scope == "col") return CellRole.Header;
        if (scope == "row") return CellRole.FirstColumn;
        return CellRole.Body;
    }

    /// <summary>Create an empty document with page settings, styles, headers, and footers.</summary>
    static void CreateSkeleton(WordprocessingDocument document, FormatReader format, ChromeAssets chrome)
    {
        var mainPart = document.AddMainDocumentPart();
        AddStyles(mainPart, format);
        AddDocumentSettings(mainPart);

        var section = CreateSectionProperties(mainPart, format, chrome);
        mainPart.Document = new Wp.Document(new Wp.Body(section));
        mainPart.Document.Save();
    }

    /// <summary>Write default body and six heading styles for direct reuse by the HTML converter.</summary>
    static void AddStyles(MainDocumentPart mainPart, FormatReader format)
    {
        var stylesPart = mainPart.AddNewPart<StyleDefinitionsPart>();
        var body = format.Section("body_text");
        var styles = new Wp.Styles(
            new Wp.Style(
                new Wp.StyleName { Val = "Normal" },
                // Apply body spacing per paragraph; Normal carries no line-based units so headings, captions, and tables do not inherit body paragraph spacing.
                new Wp.StyleParagraphProperties(CreateSpacing(0, 0, 1)),
                CreateStyleRunProperties(
                    format.Text(body, "font", "宋体"),
                    FontHalfPoints(format.Text(body, "size", "小四")),
                    null,
                    null))
            {
                Type = Wp.StyleValues.Paragraph,
                StyleId = "Normal",
                Default = true,
            });

        for (var level = 1; level <= 6; level += 1)
        {
            var heading = format.Heading(level);
            styles.AppendChild(new Wp.Style(
                new Wp.StyleName { Val = $"Heading {level}" },
                new Wp.BasedOn { Val = "Normal" },
                new Wp.NextParagraphStyle { Val = "Normal" },
                new Wp.StyleParagraphProperties(
                    new Wp.KeepNext(),
                    CreateSpacing(
                        format.Number(heading, "spacing_before_pt", level <= 3 ? 10 : 5),
                        format.Number(heading, "spacing_after_pt", level <= 3 ? 10 : 5),
                        format.Number(heading, "line_spacing", 1)),
                    new Wp.OutlineLevel { Val = level - 1 }),
                CreateStyleRunProperties(
                    format.Text(heading, "font", level <= 5 ? "黑体" : "宋体"),
                    FontHalfPoints(format.Text(heading, "size", level == 1 ? "小二" : level == 2 ? "四号" : "小四")),
                    format.Bool(heading, "bold", false),
                    Color(format.Text(heading, "text_color", "#243048"), "243048")))
            {
                Type = Wp.StyleValues.Paragraph,
                StyleId = $"Heading{level}",
            });
        }

        stylesPart.Styles = styles;
        stylesPart.Styles.Save();
    }

    /// <summary>
    /// Request page-number field updates when Word or an editor opens the document, and declare Word 2013+ compatibility mode 15.
    /// Without compatibility mode, Word uses 2007 layout: percentage-width tables add cell side margins outside column widths,
    /// forcing full-width tables and chapter frames to use absolute widths that misalign with heading borders after users change margins in Word.
    /// OOXML schema order requires updateFields before compat.
    /// </summary>
    static void AddDocumentSettings(MainDocumentPart mainPart)
    {
        var settingsPart = mainPart.AddNewPart<DocumentSettingsPart>();
        settingsPart.Settings = new Wp.Settings(
            new Wp.UpdateFieldsOnOpen { Val = true },
            new Wp.Compatibility(new Wp.CompatibilitySetting
            {
                Name = Wp.CompatSettingNameValues.CompatibilityMode,
                Uri = "http://schemas.microsoft.com/office/word",
                Val = "15",
            }));
        settingsPart.Settings.Save();
    }

    /// <summary>Build page size, margins, columns, and header/footer references from the template.</summary>
    static Wp.SectionProperties CreateSectionProperties(
        MainDocumentPart mainPart,
        FormatReader format,
        ChromeAssets chrome,
        bool? firstPageDifferent = null)
    {
        var page = format.Section("page");
        var useDifferentFirstPage = firstPageDifferent ?? format.Bool(page, "first_page_different", false);
        var paper = PaperSizes.TryGetValue(format.Text(page, "paper_size", "a4"), out var found)
            ? found
            : PaperSizes["a4"];
        var landscape = format.Text(page, "orientation", "portrait") == "landscape";
        var width = MmToTwips(landscape ? paper.Height : paper.Width);
        var height = MmToTwips(landscape ? paper.Width : paper.Height);
        var section = new Wp.SectionProperties();

        AddHeaderReferences(mainPart, section, format, chrome, useDifferentFirstPage);
        AddFooterReferences(mainPart, section, format, chrome, useDifferentFirstPage);
        section.Append(
            new Wp.PageSize
            {
                Width = (uint)width,
                Height = (uint)height,
                Orient = landscape ? Wp.PageOrientationValues.Landscape : Wp.PageOrientationValues.Portrait,
            },
            new Wp.PageMargin
            {
                // Use shared-module margins that already clear decoration bands when decorations exist; otherwise use configured values.
                Top = CmToTwips(chrome.HasLayout
                    ? chrome.MarginTopCm
                    : format.Number(page, "margin_top_cm", 2)),
                Bottom = CmToTwips(chrome.HasLayout
                    ? chrome.MarginBottomCm
                    : format.Number(page, "margin_bottom_cm", 2)),
                Left = (uint)CmToTwips(format.Number(page, "margin_left_cm", 2)),
                Right = (uint)CmToTwips(format.Number(page, "margin_right_cm", 2)),
                // Headers: align to the page top with decorations (floating text boxes position text); plain paragraphs use 1.25 cm.
                // Footer text and floating decorations use bottom-edge distances from the shared layout.
                Header = (uint)CmToTwips(chrome.HasLayout ? chrome.HeaderDistanceCm : 1.25),
                Footer = (uint)CmToTwips(chrome.FooterDistanceCm),
                Gutter = 0U,
            });
        if (format.Bool(page, "page_number_enabled", false))
        {
            section.AppendChild(new Wp.PageNumberType
            {
                Start = Math.Max(1, format.Integer(page, "page_number_start", 1)),
            });
        }
        if (landscape && format.Bool(page, "two_column", false))
        {
            section.AppendChild(new Wp.Columns { ColumnCount = 2, Space = "720" });
        }
        if (useDifferentFirstPage) section.AppendChild(new Wp.TitlePage());
        return section;
    }

    /// <summary>Create the default header and an empty first-page header when different-first-page is enabled.</summary>
    static void AddHeaderReferences(
        MainDocumentPart mainPart,
        Wp.SectionProperties section,
        FormatReader format,
        ChromeAssets chrome,
        bool firstPageDifferent)
    {
        var page = format.Section("page");
        if (!format.Bool(page, "header_enabled", false)) return;

        var headerPart = mainPart.AddNewPart<HeaderPart>();
        headerPart.Header = new Wp.Header(CreateHeaderContent(format, chrome, headerPart));
        headerPart.Header.Save();
        section.AppendChild(new Wp.HeaderReference
        {
            Type = Wp.HeaderFooterValues.Default,
            Id = mainPart.GetIdOfPart(headerPart),
        });

        if (!firstPageDifferent) return;
        var firstPart = mainPart.AddNewPart<HeaderPart>();
        firstPart.Header = new Wp.Header(new Wp.Paragraph());
        firstPart.Header.Save();
        section.AppendChild(new Wp.HeaderReference
        {
            Type = Wp.HeaderFooterValues.First,
            Id = mainPart.GetIdOfPart(firstPart),
        });
    }

    /// <summary>Create the default footer; decorated styles carry page numbers and body text in separate regions.</summary>
    static void AddFooterReferences(
        MainDocumentPart mainPart,
        Wp.SectionProperties section,
        FormatReader format,
        ChromeAssets chrome,
        bool firstPageDifferent)
    {
        var page = format.Section("page");
        if (!format.Bool(page, "footer_enabled", false)
            && !format.Bool(page, "page_number_enabled", false)) return;

        var footerPart = mainPart.AddNewPart<FooterPart>();
        footerPart.Footer = new Wp.Footer(CreateFooterContent(format, chrome, footerPart));
        footerPart.Footer.Save();
        section.AppendChild(new Wp.FooterReference
        {
            Type = Wp.HeaderFooterValues.Default,
            Id = mainPart.GetIdOfPart(footerPart),
        });

        if (!firstPageDifferent) return;
        var firstPart = mainPart.AddNewPart<FooterPart>();
        firstPart.Footer = new Wp.Footer(new Wp.Paragraph());
        firstPart.Footer.Save();
        section.AppendChild(new Wp.FooterReference
        {
            Type = Wp.HeaderFooterValues.First,
            Id = mainPart.GetIdOfPart(firstPart),
        });
    }

    /// <summary>
    /// Full-page-width decoration images in headers/footers.
    ///
    /// Position relative to paper, below text, without wrapping: Word's standard watermark/stationery-background method.
    /// Decorations can therefore bleed beyond margins, ignore body column width, and consume no document-flow height.
    /// Paragraph shading only draws rectangles; gradients and slanted edges require images.
    /// </summary>
    static Wp.Run CreateAnchoredPicture(
        OpenXmlPartContainer container,
        string imagePath,
        uint drawingId,
        string name,
        double widthCm,
        double heightCm,
        double xCm,
        double yCm,
        uint zIndex)
    {
        // Headers and footers each own an ImagePart; relationship IDs cannot be reused across parts.
        var imagePart = container switch
        {
            HeaderPart header => header.AddImagePart(ImagePartType.Png),
            FooterPart footer => footer.AddImagePart(ImagePartType.Png),
            _ => throw new InvalidOperationException("装饰图只能挂在页眉或页脚部件上"),
        };
        using (var stream = File.OpenRead(imagePath))
        {
            imagePart.FeedData(stream);
        }
        var relationshipId = container.GetIdOfPart(imagePart);

        var extent = new DW.Extent { Cx = CmToEmu(widthCm), Cy = CmToEmu(heightCm) };
        var picture = new PIC.Picture(
            new PIC.NonVisualPictureProperties(
                new PIC.NonVisualDrawingProperties { Id = drawingId, Name = name },
                new PIC.NonVisualPictureDrawingProperties()),
            new PIC.BlipFill(
                new A.Blip { Embed = relationshipId, CompressionState = A.BlipCompressionValues.Print },
                new A.Stretch(new A.FillRectangle())),
            new PIC.ShapeProperties(
                new A.Transform2D(
                    new A.Offset { X = 0L, Y = 0L },
                    new A.Extents { Cx = extent.Cx, Cy = extent.Cy }),
                new A.PresetGeometry(new A.AdjustValueList()) { Preset = A.ShapeTypeValues.Rectangle }));

        // The schema enforces child-element order:
        // simplePos -> positionH -> positionV -> extent -> effectExtent -> wrap -> docPr -> cNvGraphicFramePr -> graphic
        var anchor = new DW.Anchor(
            new DW.SimplePosition { X = 0L, Y = 0L },
            new DW.HorizontalPosition(new DW.PositionOffset(CmToEmu(xCm).ToString(CultureInfo.InvariantCulture)))
            { RelativeFrom = DW.HorizontalRelativePositionValues.Page },
            new DW.VerticalPosition(new DW.PositionOffset(CmToEmu(yCm).ToString(CultureInfo.InvariantCulture)))
            { RelativeFrom = DW.VerticalRelativePositionValues.Page },
            extent,
            new DW.EffectExtent { LeftEdge = 0L, TopEdge = 0L, RightEdge = 0L, BottomEdge = 0L },
            new DW.WrapNone(),
            new DW.DocProperties { Id = drawingId, Name = name },
            new DW.NonVisualGraphicFrameDrawingProperties(new A.GraphicFrameLocks { NoChangeAspect = true }),
            new A.Graphic(new A.GraphicData(picture)
            { Uri = "http://schemas.openxmlformats.org/drawingml/2006/picture" }))
        {
            DistanceFromTop = 0U,
            DistanceFromBottom = 0U,
            DistanceFromLeft = 0U,
            DistanceFromRight = 0U,
            SimplePos = false,
            RelativeHeight = zIndex,
            BehindDoc = true,
            Locked = false,
            LayoutInCell = true,
            AllowOverlap = true,
        };
        return new Wp.Run(new Wp.Drawing(anchor));
    }

    /// <summary>Base header/footer text-block paragraph: zero spacing, single line spacing, and caller-specified alignment.</summary>
    static Wp.Paragraph CreateChromeParagraph(string alignment)
    {
        return new Wp.Paragraph(new Wp.ParagraphProperties(
            new Wp.SpacingBetweenLines { Before = "0", After = "0", Line = "240", LineRule = Wp.LineSpacingRuleValues.Auto },
            new Wp.Justification { Val = Alignment(alignment) }));
    }

    /// <summary>
    /// Place text in an anchored floating text box positioned absolutely relative to paper.
    ///
    /// Use text boxes rather than floating tables or paragraph frames because their tblpPr / framePr positioning
    /// does not work in docx-editor.dev (horizontal offsets were entirely ignored in testing); only wp:anchor
    /// is precise. Sharing the decoration image's positioning mechanism keeps both aligned.
    /// Text boxes are transparent and borderless; text remains editable, searchable native runs.
    /// </summary>
    static Wp.Run CreateChromeTextBox(ChromeTextBox box, Wp.Paragraph paragraph, uint drawingId, string name)
    {
        var widthCm = Math.Max(0.1, box.EndCm - box.StartCm);
        var heightCm = Math.Max(0.1, box.HeightCm);
        var extent = new DW.Extent { Cx = CmToEmu(widthCm), Cy = CmToEmu(heightCm) };

        var shape = new Wps.WordprocessingShape(
            new Wps.NonVisualDrawingShapeProperties { TextBox = true },
            new Wps.ShapeProperties(
                new A.Transform2D(
                    new A.Offset { X = 0L, Y = 0L },
                    new A.Extents { Cx = extent.Cx, Cy = extent.Cy }),
                new A.PresetGeometry(new A.AdjustValueList()) { Preset = A.ShapeTypeValues.Rectangle },
                new A.NoFill()),
            new Wps.TextBoxInfo2(new Wp.TextBoxContent(paragraph)),
            // anchor=ctr vertically centers text; zero all padding so the box alone determines position.
            new Wps.TextBodyProperties
            {
                Rotation = 0,
                Anchor = A.TextAnchoringTypeValues.Center,
                LeftInset = 0,
                TopInset = 0,
                RightInset = 0,
                BottomInset = 0,
            });

        var anchor = new DW.Anchor(
            new DW.SimplePosition { X = 0L, Y = 0L },
            new DW.HorizontalPosition(new DW.PositionOffset(CmToEmu(box.StartCm).ToString(CultureInfo.InvariantCulture)))
            { RelativeFrom = DW.HorizontalRelativePositionValues.Page },
            new DW.VerticalPosition(new DW.PositionOffset(CmToEmu(box.TopCm).ToString(CultureInfo.InvariantCulture)))
            { RelativeFrom = DW.VerticalRelativePositionValues.Page },
            extent,
            new DW.EffectExtent { LeftEdge = 0L, TopEdge = 0L, RightEdge = 0L, BottomEdge = 0L },
            new DW.WrapNone(),
            new DW.DocProperties { Id = drawingId, Name = name },
            new DW.NonVisualGraphicFrameDrawingProperties(),
            new A.Graphic(new A.GraphicData(shape)
            { Uri = "http://schemas.microsoft.com/office/word/2010/wordprocessingShape" }))
        {
            DistanceFromTop = 0U,
            DistanceFromBottom = 0U,
            DistanceFromLeft = 0U,
            DistanceFromRight = 0U,
            SimplePos = false,
            RelativeHeight = drawingId,
            // Text must appear above decorations, not below the text layer.
            BehindDoc = false,
            Locked = false,
            LayoutInCell = true,
            AllowOverlap = true,
        };
        return new Wp.Run(new Wp.Drawing(anchor));
    }

    /// <summary>Floating-table anchor and required trailing paragraph occupy only 1 twip and may also carry decoration backgrounds.</summary>
    static Wp.Paragraph CreateChromeAnchor(IEnumerable<OpenXmlElement>? children = null)
    {
        var paragraph = CreateChromeParagraph("左对齐");
        SetSingleChild(paragraph.ParagraphProperties!, new Wp.SpacingBetweenLines
        {
            Before = "0", After = "0", Line = "1", LineRule = Wp.LineSpacingRuleValues.Exact,
        });
        if (children is not null) paragraph.Append(children);
        paragraph.AppendChild(new Wp.Run(new Wp.RunProperties(new Wp.FontSize { Val = "1" }), new Wp.Text("")));
        return paragraph;
    }

    /// <summary>Lay out header titles and short badges by style region; plain headers retain paragraph layout.</summary>
    static IEnumerable<OpenXmlElement> CreateHeaderContent(FormatReader format, ChromeAssets chrome, HeaderPart headerPart)
    {
        var page = format.Section("page");
        var text = format.Text(page, "header_text", "").Trim();
        // Only band style uses the short badge (the frontend input is also shown only for band).
        // Other styles must not merge it into body text, which would leave uneditable extra text after switching styles.
        var badge = format.Text(page, "header_badge_text", "").Trim();
        if (badge.Length > 4) badge = badge[..4];

        var layout = chrome.HeaderText;
        var color = layout is not null && layout.Color.Length > 0
            ? Color(layout.Color, "536176")
            : Color(format.Text(page, "header_color", "#536176"), "536176");
        var bold = layout?.Bold ?? false;
        var alignment = layout is not null && layout.Align.Length > 0
            ? layout.Align
            : format.Text(page, "header_alignment", "居中对齐");

        var paragraph = CreateChromeParagraph(alignment);
        var decoration = new List<OpenXmlElement>();
        if (chrome.HasHeaderImage)
        {
            decoration.Add(CreateAnchoredPicture(
                headerPart,
                chrome.HeaderImagePath,
                901U,
                "HeaderDecoration",
                ResolvePaperSize(format).Width,
                chrome.HeaderHeightCm,
                0,
                0,
                10U));
        }

        var font = format.Text(page, "header_font", "宋体");
        var size = FontHalfPoints(format.Text(page, "header_size", "小五"));
        paragraph.AppendChild(CreateRun(text, font, size, color, bold, false));
        if (layout?.Box is { } box)
        {
            // Decorations and text blocks are floating objects attached to one 1-twip-high paragraph,
            // so they do not expand the header region; their anchors determine all positioning.
            var floats = new List<OpenXmlElement>(decoration);
            if (layout.Badge?.Box is { } badgeBox && badge.Length > 0)
            {
                var badgeParagraph = CreateChromeParagraph(layout.Badge.Align);
                badgeParagraph.AppendChild(CreateRun(
                    badge, font, size, Color(layout.Badge.Color, "FFFFFF"), layout.Badge.Bold, false));
                floats.Add(CreateChromeTextBox(badgeBox, badgeParagraph, 911U, "HeaderBadgeText"));
            }
            floats.Add(CreateChromeTextBox(box, paragraph, 912U, "HeaderText"));
            return [CreateChromeAnchor(floats)];
        }
        paragraph.Append(decoration);
        return [paragraph];
    }

    /// <summary>Footer: anchored decoration images, native text/PAGE runs, and run-level page-number shading that automatically fits text width.</summary>
    static IEnumerable<OpenXmlElement> CreateFooterContent(FormatReader format, ChromeAssets chrome, FooterPart footerPart)
    {
        var page = format.Section("page");
        var layout = chrome.FooterText;

        var font = format.Text(page, "footer_font", "宋体");
        var size = FontHalfPoints(format.Text(page, "footer_size", "小五"));
        var textColor = layout is not null && layout.Color.Length > 0
            ? Color(layout.Color, "536176")
            : Color(format.Text(page, "footer_color", "#536176"), "536176");

        var paragraph = CreateChromeParagraph(layout?.Align ?? format.Text(page, "footer_alignment", "居中对齐"));
        var pageParagraph = CreateChromeParagraph(layout?.PageNumberAlign ?? "居中对齐");
        var decoration = new List<OpenXmlElement>();
        if (chrome.HasFooterImage)
        {
            decoration.Add(CreateAnchoredPicture(
                footerPart,
                chrome.FooterImagePath,
                902U,
                "FooterDecoration",
                ResolvePaperSize(format).Width,
                chrome.FooterHeightCm,
                0,
                chrome.FooterTopCm,
                20U));
        }

        var footerEnabled = format.Bool(page, "footer_enabled", false);
        var pageNumberEnabled = format.Bool(page, "page_number_enabled", false);

        if (footerEnabled)
        {
            var footerText = format.Text(page, "footer_text", "").Trim();
            if (footerText.Length > 0)
            {
                paragraph.AppendChild(CreateRun(footerText, font, size, textColor, false, false));
            }
        }
        if (pageNumberEnabled)
        {
            var pageColor = layout is not null && layout.PageNumberColor.Length > 0
                ? Color(layout.PageNumberColor, "536176")
                : textColor;
            AppendPageNumber(
                pageParagraph,
                format.Text(page, "page_number_format", "第{page}页"),
                format.Integer(page, "page_number_pad", 0),
                font,
                size,
                pageColor,
                layout?.PageNumberBold ?? false);

            // Page-number text retains native run shading over the region's decoration background.
            var shading = layout?.PageNumberShading ?? "";
            if (shading.Length > 0)
            {
                var fill = Color(shading, "536176");
                foreach (var run in pageParagraph.Elements<Wp.Run>())
                {
                    // The schema enforces w:rPr child order: shd follows sz/szCs.
                    run.RunProperties?.AppendChild(new Wp.Shading
                    {
                        Val = Wp.ShadingPatternValues.Clear,
                        Color = "auto",
                        Fill = fill,
                    });
                }
            }
        }
        if (layout?.Box is { } box)
        {
            // Collect all floating objects and attach them to one 1-twip-high paragraph at the end.
            var blocks = new List<OpenXmlElement>();
            if (layout.PageNumberBox is { } pageBox)
            {
                // Regional styles: body text and page numbers occupy separate blocks, with numbers aligned to the decoration's colored block.
                if (paragraph.Elements<Wp.Run>().Any())
                {
                    blocks.Add(CreateChromeTextBox(box, paragraph, 921U, "FooterText"));
                }
                if (pageNumberEnabled)
                {
                    blocks.Add(CreateChromeTextBox(pageBox, pageParagraph, 922U, "FooterPageNumber"));
                }
            }
            else
            {
                // Unpartitioned style (rules): body text and page numbers share one block, preserving a single centered line.
                if (paragraph.Elements<Wp.Run>().Any() && pageNumberEnabled)
                {
                    paragraph.AppendChild(CreateRun("    ", font, size, textColor, false, false));
                }
                foreach (var run in pageParagraph.Elements<Wp.Run>().ToArray())
                {
                    run.Remove();
                    paragraph.AppendChild(run);
                }
                if (paragraph.Elements<Wp.Run>().Any())
                {
                    blocks.Add(CreateChromeTextBox(box, paragraph, 921U, "FooterText"));
                }
            }
            blocks.InsertRange(0, decoration);
            return [CreateChromeAnchor(blocks)];
        }
        if (paragraph.Elements<Wp.Run>().Any() && pageNumberEnabled)
        {
            paragraph.AppendChild(CreateRun("    ", font, size, textColor, false, false));
        }
        foreach (var run in pageParagraph.Elements<Wp.Run>().ToArray())
        {
            run.Remove();
            paragraph.AppendChild(run);
        }
        paragraph.Append(decoration);
        if (!paragraph.Elements<Wp.Run>().Any()) paragraph.AppendChild(new Wp.Run(new Wp.Text("")));
        return [paragraph];
    }

    /// <summary>Replace {page} in the format string with a Word page-number field.</summary>
    static void AppendPageNumber(
        Wp.Paragraph paragraph,
        string format,
        int pad,
        string font,
        int size,
        string color,
        bool bold = false)
    {
        if (format.Length == 0) format = "第{page}页";
        var markerIndex = format.IndexOf("{page}", StringComparison.Ordinal);
        if (markerIndex < 0)
        {
            paragraph.AppendChild(CreateRun(format, font, size, color, bold, false));
            return;
        }
        var prefix = format[..markerIndex];
        var suffix = format[(markerIndex + 6)..];
        if (prefix.Length > 0) paragraph.AppendChild(CreateRun(prefix, font, size, color, bold, false));

        paragraph.AppendChild(CreateFieldRun(Wp.FieldCharValues.Begin, font, size, color, bold));
        var picture = pad > 0 ? $" \\# \"{new string('0', Math.Clamp(pad, 1, 6))}\"" : "";
        var codeRun = CreateRun($" PAGE{picture} ", font, size, color, bold, false);
        var codeText = codeRun.GetFirstChild<Wp.Text>();
        if (codeText is not null)
        {
            codeText.Remove();
            codeRun.AppendChild(new Wp.FieldCode($" PAGE{picture} ") { Space = SpaceProcessingModeValues.Preserve });
        }
        paragraph.AppendChild(codeRun);
        paragraph.AppendChild(CreateFieldRun(Wp.FieldCharValues.Separate, font, size, color, bold));
        paragraph.AppendChild(CreateRun(pad > 0 ? new string('0', Math.Clamp(pad, 1, 6)) : "1", font, size, color, bold, false));
        paragraph.AppendChild(CreateFieldRun(Wp.FieldCharValues.End, font, size, color, bold));
        if (suffix.Length > 0) paragraph.AppendChild(CreateRun(suffix, font, size, color, bold, false));
    }

    static Wp.Run CreateFieldRun(Wp.FieldCharValues type, string font, int size, string color, bool bold = false)
    {
        var run = CreateRun("", font, size, color, bold, false);
        run.RemoveAllChildren<Wp.Text>();
        run.AppendChild(new Wp.FieldChar { FieldCharType = type });
        return run;
    }

    /// <summary>Open the converted document and apply template direct formatting to each block type.</summary>
    static void ApplyFormatting(WordprocessingDocument document, FormatReader format, IReadOnlyList<TableSpec> tableSpecs, bool rangeOnly = false)
    {
        var mainPart = document.MainDocumentPart ?? throw new InvalidOperationException("Word 缺少正文部件");
        var content = mainPart.Document.Body ?? throw new InvalidOperationException("Word 缺少正文");
        var tableCaptions = content.Elements<Wp.Paragraph>()
            .Where(paragraph => paragraph.InnerText.Contains(TableCaptionMarker, StringComparison.Ordinal))
            .ToHashSet();

        foreach (var paragraph in content.Descendants<Wp.Paragraph>())
        {
            if (paragraph.Ancestors<Wp.TableCell>().Any()) continue;
            ApplyParagraph(paragraph, format);
        }
        ApplyTables(content, format, tableSpecs);
        ApplyNumbering(mainPart, format, rangeOnly ? IsolateNumbering(mainPart, content) : null);
        // Page frames and full-width top-level headings retain their existing mutual exclusion; apply whole-document columns after merging page ranges.
        if (ChapterFrameEnabled(format)) ApplyChapterFrames(content, format, tableCaptions);
        else if (!rangeOnly) ApplyTwoColumnHeadingSections(mainPart, content, format);
        if (!rangeOnly) RemoveLeadingPageBreak(content);
        mainPart.Document.Save();
    }

    /// <summary>Distinguish headings, body text, lists, and captions using temporary markers.</summary>
    static void ApplyParagraph(Wp.Paragraph paragraph, FormatReader format)
    {
        var text = paragraph.InnerText;
        for (var level = 1; level <= 6; level += 1)
        {
            var marker = $"{HeadingMarker}{level}:";
            if (!text.Contains(marker, StringComparison.Ordinal)) continue;
            RemoveMarker(paragraph, marker);
            ApplyHeading(paragraph, format, level);
            return;
        }
        if (text.Contains(TableCaptionMarker, StringComparison.Ordinal))
        {
            RemoveMarker(paragraph, TableCaptionMarker);
            ApplyCaption(paragraph, format, format.Section("table"), keepNext: true);
            return;
        }
        if (text.Contains(FigureCaptionMarker, StringComparison.Ordinal))
        {
            RemoveMarker(paragraph, FigureCaptionMarker);
            ApplyCaption(paragraph, format, format.Section("image"), keepNext: false);
            return;
        }
        if (paragraph.Descendants<Wp.Drawing>().Any())
        {
            SetParagraphLayout(paragraph, Alignment(format.Text(format.Section("image"), "alignment", "居中对齐")), 0, 0, 1, 0);
            SetImageKeepWithCaption(paragraph);
            return;
        }

        var isList = text.Contains(UnorderedListMarker, StringComparison.Ordinal)
            || text.Contains(OrderedListMarker, StringComparison.Ordinal)
            || paragraph.ParagraphProperties?.NumberingProperties is not null;
        RemoveMarker(paragraph, UnorderedListMarker);
        RemoveMarker(paragraph, OrderedListMarker);
        ApplyBody(paragraph, format, isList);
    }

    /// <summary>Apply font sizes, fonts, colors, spacing, and chapter borders for six heading levels.</summary>
    static void ApplyHeading(Wp.Paragraph paragraph, FormatReader format, int level)
    {
        var heading = format.Heading(level);
        var halfPoints = FontHalfPoints(format.Text(heading, "size", level == 1 ? "小二" : level == 2 ? "四号" : "小四"));
        SetParagraphLayout(
            paragraph,
            Alignment(format.Text(heading, "alignment", level == 1 ? "居中对齐" : "两端对齐")),
            format.Number(heading, "spacing_before_pt", level <= 3 ? 10 : 5),
            format.Number(heading, "spacing_after_pt", level <= 3 ? 10 : 5),
            format.Number(heading, "line_spacing", 1),
            CharsToTwips(format.Number(heading, "first_line_indent_chars", 0), halfPoints));
        var properties = EnsureParagraphProperties(paragraph);
        SetSingleChild(properties, new Wp.ParagraphStyleId { Val = $"Heading{level}" });
        SetSingleChild(properties, new Wp.KeepNext());
        SetSingleChild(properties, new Wp.OutlineLevel { Val = level - 1 });
        if (level == 1 && format.Bool(format.Root, "heading_level1_page_break_before", false))
        {
            SetSingleChild(properties, new Wp.PageBreakBefore());
        }
        else
        {
            properties.RemoveAllChildren<Wp.PageBreakBefore>();
        }
        ClearHeadingBorder(properties);
        ApplyRuns(
            paragraph,
            format.Text(heading, "font", level <= 5 ? "黑体" : "宋体"),
            halfPoints,
            Color(format.Text(heading, "text_color", "#243048"), "243048"),
            format.Bool(heading, "bold", false),
            null);
    }

    /// <summary>
    /// Clear borders and shading carried by heading paragraphs.
    /// ApplyChapterFrames sets chapter-frame borders and shading consistently to avoid duplicate frames.
    /// </summary>
    static void ClearHeadingBorder(Wp.ParagraphProperties properties)
    {
        properties.RemoveAllChildren<Wp.ParagraphBorders>();
        properties.RemoveAllChildren<Wp.Shading>();
    }

    /// <summary>Apply body formatting; lists retain numbering indentation instead of first-line indentation.</summary>
    static void ApplyBody(Wp.Paragraph paragraph, FormatReader format, bool isList)
    {
        var body = format.Section("body_text");
        var halfPoints = FontHalfPoints(format.Text(body, "size", "小四"));
        SetParagraphLayout(
            paragraph,
            Alignment(format.Text(body, "alignment", "左对齐")),
            CreateBodySpacing(format),
            isList ? 0 : CharsToTwips(format.Number(body, "first_line_indent_chars", 2), halfPoints));
        ApplyRuns(paragraph, format.Text(body, "font", "宋体"), halfPoints, null, null, null);
    }

    /// <summary>Apply table/figure caption fonts, alignment, bold, and italic settings.</summary>
    static void ApplyCaption(Wp.Paragraph paragraph, FormatReader format, JsonElement style, bool keepNext)
    {
        SetParagraphLayout(
            paragraph,
            Alignment(format.Text(style, "caption_alignment", "居中对齐")),
            0,
            4,
            1,
            0);
        ApplyRuns(
            paragraph,
            format.Text(style, "caption_font", "宋体"),
            FontHalfPoints(format.Text(style, "caption_size", "小五")),
            null,
            format.Bool(style, "caption_bold", false),
            format.Bool(style, "caption_italic", false));
        var properties = EnsureParagraphProperties(paragraph);
        properties.RemoveAllChildren<Wp.KeepNext>();
        if (keepNext) properties.AddChild(new Wp.KeepNext(), throwOnError: true);
    }

    /// <summary>Set borders, widths, padding, and cell roles in source HTML table order.</summary>
    static void ApplyTables(
        Wp.Body content,
        FormatReader format,
        IReadOnlyList<TableSpec> tableSpecs)
    {
        var tables = content.Descendants<Wp.Table>().ToList();
        for (var tableIndex = 0; tableIndex < tables.Count; tableIndex += 1)
        {
            var table = tables[tableIndex];
            var spec = tableIndex < tableSpecs.Count ? tableSpecs[tableIndex] : null;
            ApplyTableProperties(table, format);
            var rows = table.Elements<Wp.TableRow>().ToList();
            for (var rowIndex = 0; rowIndex < rows.Count; rowIndex += 1)
            {
                var rowProperties = rows[rowIndex].GetFirstChild<Wp.TableRowProperties>()
                    ?? rows[rowIndex].PrependChild(new Wp.TableRowProperties());
                // Only header rows prohibit page splitting; body rows always allow it, otherwise a row taller than a page can never fit,
                // and oversized tables inside page frames move as a whole, leaving large blanks on the previous page.
                rowProperties.RemoveAllChildren<Wp.CantSplit>();
                rowProperties.RemoveAllChildren<Wp.TableHeader>();
                if (spec is not null && rowIndex < spec.Rows.Count && spec.Rows[rowIndex].IsHeaderRow)
                {
                    // Append both row properties so AddChild does not overwrite the non-splitting setting when adding repeated headers.
                    rowProperties.Append(new Wp.CantSplit(), new Wp.TableHeader());
                }
                var cells = rows[rowIndex].Elements<Wp.TableCell>().ToList();
                for (var cellIndex = 0; cellIndex < cells.Count; cellIndex += 1)
                {
                    var role = spec is not null
                        && rowIndex < spec.Rows.Count
                        && cellIndex < spec.Rows[rowIndex].Cells.Count
                            ? spec.Rows[rowIndex].Cells[cellIndex]
                            : CellRole.Body;
                    ApplyTableCell(cells[cellIndex], format, role);
                }
            }
        }
    }

    /// <summary>Override the HTML converter's default table outline with template settings.</summary>
    static void ApplyTableProperties(Wp.Table table, FormatReader format)
    {
        var style = format.Section("table");
        var properties = table.GetFirstChild<Wp.TableProperties>() ?? table.PrependChild(new Wp.TableProperties());
        properties.RemoveAllChildren();
        var fullWidth = format.Bool(style, "full_width", true);
        // Full-width tables use 100% column width and adapt to margin/column changes in Word; nested tables are relative to parent cells.
        // Requires compatibility mode 15 from AddDocumentSettings: outer edges align exactly with margins without adding cell margins outside.
        properties.AppendChild(new Wp.TableWidth
        {
            Type = fullWidth ? Wp.TableWidthUnitValues.Pct : Wp.TableWidthUnitValues.Auto,
            Width = fullWidth ? "5000" : "0",
        });

        var borderColor = Color(format.Text(style, "border_color", "#dcdff6"), "DCDFF6");
        var borderSize = (uint)Math.Clamp((int)Math.Round(format.Number(style, "border_width", 1) * 8), 0, 96);
        properties.AppendChild(new Wp.TableBorders(
            CreateTableBorder<Wp.TopBorder>(borderColor, borderSize),
            CreateTableBorder<Wp.LeftBorder>(borderColor, borderSize),
            CreateTableBorder<Wp.BottomBorder>(borderColor, borderSize),
            CreateTableBorder<Wp.RightBorder>(borderColor, borderSize),
            CreateTableBorder<Wp.InsideHorizontalBorder>(borderColor, borderSize),
            CreateTableBorder<Wp.InsideVerticalBorder>(borderColor, borderSize)));
        properties.AppendChild(new Wp.TableLayout
        {
            Type = fullWidth ? Wp.TableLayoutValues.Fixed : Wp.TableLayoutValues.Autofit,
        });

        var padding = Math.Max(0, (int)Math.Round(format.Number(style, "cell_padding_pt", 6) * 20));
        properties.AppendChild(new Wp.TableCellMarginDefault(
            new Wp.TopMargin { Width = padding.ToString(CultureInfo.InvariantCulture), Type = Wp.TableWidthUnitValues.Dxa },
            new Wp.TableCellLeftMargin { Width = (short)Math.Min(short.MaxValue, padding), Type = Wp.TableWidthValues.Dxa },
            new Wp.BottomMargin { Width = padding.ToString(CultureInfo.InvariantCulture), Type = Wp.TableWidthUnitValues.Dxa },
            new Wp.TableCellRightMargin { Width = (short)Math.Min(short.MaxValue, padding), Type = Wp.TableWidthValues.Dxa }));
    }

    /// <summary>Apply independent styles for header cells, first-column cells, or ordinary cells.</summary>
    static void ApplyTableCell(Wp.TableCell cell, FormatReader format, CellRole role)
    {
        var table = format.Section("table");
        var style = format.Child(table, role switch
        {
            CellRole.Header => "header_row",
            CellRole.FirstColumn => "first_column",
            _ => "body_cell",
        });
        var properties = cell.GetFirstChild<Wp.TableCellProperties>() ?? cell.PrependChild(new Wp.TableCellProperties());
        SetSingleChild(properties, new Wp.Shading
        {
            Val = Wp.ShadingPatternValues.Clear,
            Fill = Color(format.Text(style, "background_color", role == CellRole.Header ? "#eef5ff" : "#ffffff"), "FFFFFF"),
        });

        foreach (var paragraph in cell.Descendants<Wp.Paragraph>()
            .Where(item => ReferenceEquals(item.Ancestors<Wp.TableCell>().FirstOrDefault(), cell)))
        {
            var text = paragraph.InnerText;
            if (text.Contains(TableCaptionMarker, StringComparison.Ordinal))
            {
                RemoveMarker(paragraph, TableCaptionMarker);
                ApplyCaption(paragraph, format, format.Section("table"), keepNext: true);
                continue;
            }
            if (text.Contains(FigureCaptionMarker, StringComparison.Ordinal))
            {
                RemoveMarker(paragraph, FigureCaptionMarker);
                ApplyCaption(paragraph, format, format.Section("image"), keepNext: false);
                continue;
            }
            if (paragraph.Descendants<Wp.Drawing>().Any())
            {
                SetParagraphLayout(paragraph, Alignment(format.Text(format.Section("image"), "alignment", "居中对齐")), 0, 0, 1, 0);
                SetImageKeepWithCaption(paragraph);
                continue;
            }

            RemoveMarker(paragraph, UnorderedListMarker);
            RemoveMarker(paragraph, OrderedListMarker);
            SetParagraphLayout(
                paragraph,
                Alignment(format.Text(style, "alignment", role == CellRole.Header ? "居中对齐" : "左对齐")),
                CreateBodySpacing(format, tableCell: true),
                paragraph.ParagraphProperties?.NumberingProperties is null ? 0 : -1);
            ApplyRuns(
                paragraph,
                format.Text(style, "font", role == CellRole.Header ? "黑体" : "宋体"),
                FontHalfPoints(format.Text(style, "size", "小四")),
                Color(format.Text(style, "text_color", "#243048"), "243048"),
                role == CellRole.Header ? true : null,
                null);
        }
    }

    /// <summary>Normalize converter-generated list numbering to the template's selected bullets and numbering.</summary>
    static void ApplyNumbering(MainDocumentPart mainPart, FormatReader format, HashSet<int>? abstractIds = null)
    {
        var numbering = mainPart.NumberingDefinitionsPart?.Numbering;
        if (numbering is null) return;
        var body = format.Section("body_text");
        var halfPoints = FontHalfPoints(format.Text(body, "size", "小四"));
        var indentChars = format.Number(body, "list_indent_chars", 2);
        var framed = ChapterFrameEnabled(format);

        foreach (var abstractNumber in numbering.Elements<Wp.AbstractNum>())
        {
            if (abstractIds is not null && !abstractIds.Contains(abstractNumber.AbstractNumberId!.Value)) continue;
            foreach (var level in abstractNumber.Elements<Wp.Level>())
            {
                var levelIndex = Math.Clamp(level.LevelIndex?.Value ?? 0, 0, 8);
                var currentFormat = level.GetFirstChild<Wp.NumberingFormat>()?.Val?.Value;
                var unordered = currentFormat == Wp.NumberFormatValues.Bullet;
                if (unordered) ApplyUnorderedLevel(level, format.Text(body, "list_style", "disc"), halfPoints);
                else ApplyOrderedLevel(level, format.Text(body, "ordered_list_style", "decimal-dot"), levelIndex);

                var indent = ListLevelIndent(indentChars, levelIndex, halfPoints, framed);
                var paragraphProperties = level.GetFirstChild<Wp.PreviousParagraphProperties>()
                    ?? AddChild(level, new Wp.PreviousParagraphProperties());
                var indentation = new Wp.Indentation { Left = indent.Left.ToString(CultureInfo.InvariantCulture) };
                if (indent.Hanging > 0) indentation.Hanging = indent.Hanging.ToString(CultureInfo.InvariantCulture);
                if (indent.FirstLine > 0) indentation.FirstLine = indent.FirstLine.ToString(CultureInfo.InvariantCulture);
                SetSingleChild(paragraphProperties, indentation);
            }
        }
        numbering.Save();
    }

    /// <summary>
    /// List-level indentation; without page frames, keep consistent with getListLevelIndent in exportService.cjs.
    ///
    /// Framed body text occupies a full-width cell that supplies side padding; lists retain only first-line hierarchy indentation.
    /// </summary>
    static (int Left, int Hanging, int FirstLine) ListLevelIndent(double indentChars, int levelIndex, int halfPoints, bool framed)
    {
        var text = CharsToTwips(indentChars * (levelIndex + 1), halfPoints);
        if (!framed) return (text, Math.Min(text, CharsToTwips(1, halfPoints)), 0);
        return (0, 0, text);
    }

    /// <summary>Set unordered-list symbols and their font.</summary>
    static void ApplyUnorderedLevel(Wp.Level level, string style, int halfPoints)
    {
        var marker = style switch
        {
            "none" => ("", "Arial", 1.0),
            "circle" => ("○", "Arial", 0.82),
            "square" => ("■", "Arial", 0.72),
            "diamond" => ("◆", "Arial", 0.72),
            "dash" => ("–", "Arial", 0.9),
            "check" => ("✓", "Segoe UI Symbol", 0.85),
            "arrow" => ("➢", "Segoe UI Symbol", 0.88),
            "sparkle" => ("✧", "Segoe UI Symbol", 0.9),
            _ => ("•", "Arial", 0.75),
        };
        SetSingleChild(level, new Wp.NumberingFormat { Val = Wp.NumberFormatValues.Bullet });
        SetSingleChild(level, new Wp.LevelText { Val = marker.Item1 });
        var runProperties = level.GetFirstChild<Wp.NumberingSymbolRunProperties>()
            ?? AddChild(level, new Wp.NumberingSymbolRunProperties());
        SetSingleChild(runProperties, new Wp.RunFonts
        {
            Ascii = marker.Item2,
            HighAnsi = marker.Item2,
            EastAsia = marker.Item2,
        });
        var markerSize = Math.Max(1, (int)Math.Round(halfPoints * marker.Item3));
        SetSingleChild(runProperties, new Wp.FontSize { Val = markerSize.ToString(CultureInfo.InvariantCulture) });
    }

    /// <summary>Set ordered-list formats to digits, Chinese numerals, letters, or Roman numerals.</summary>
    static void ApplyOrderedLevel(Wp.Level level, string style, int levelIndex)
    {
        var placeholder = $"%{levelIndex + 1}";
        var (numberFormat, text) = style switch
        {
            "decimal-paren" => (Wp.NumberFormatValues.Decimal, $"{placeholder}）"),
            "decimal-full-paren" => (Wp.NumberFormatValues.Decimal, $"（{placeholder}）"),
            "chinese-dot" => (Wp.NumberFormatValues.ChineseCounting, $"{placeholder}、"),
            "chinese-paren" => (Wp.NumberFormatValues.ChineseCounting, $"（{placeholder}）"),
            "lower-alpha" => (Wp.NumberFormatValues.LowerLetter, $"{placeholder}."),
            "upper-alpha" => (Wp.NumberFormatValues.UpperLetter, $"{placeholder}."),
            "lower-roman" => (Wp.NumberFormatValues.LowerRoman, $"{placeholder}."),
            "upper-roman" => (Wp.NumberFormatValues.UpperRoman, $"{placeholder}."),
            _ => (Wp.NumberFormatValues.Decimal, $"{placeholder}."),
        };
        SetSingleChild(level, new Wp.NumberingFormat { Val = numberFormat });
        SetSingleChild(level, new Wp.LevelText { Val = text });
    }

    /// <summary>Set paragraph alignment, before/after spacing, line spacing, and first-line indentation.</summary>
    static void SetParagraphLayout(
        Wp.Paragraph paragraph,
        Wp.JustificationValues alignment,
        double beforePoints,
        double afterPoints,
        double lineMultiple,
        int firstLineTwips)
    {
        SetParagraphLayout(paragraph, alignment, CreateSpacing(beforePoints, afterPoints, lineMultiple), firstLineTwips);
    }

    /// <summary>Reuse paragraph layout while allowing body text to supply native units and line-spacing rules.</summary>
    static void SetParagraphLayout(
        Wp.Paragraph paragraph,
        Wp.JustificationValues alignment,
        Wp.SpacingBetweenLines spacing,
        int firstLineTwips)
    {
        var properties = EnsureParagraphProperties(paragraph);
        SetSingleChild(properties, new Wp.Justification { Val = alignment });
        SetSingleChild(properties, spacing);
        if (firstLineTwips < 0) return;
        properties.RemoveAllChildren<Wp.Indentation>();
        if (firstLineTwips > 0)
        {
            properties.AddChild(new Wp.Indentation
            {
                FirstLine = firstLineTwips.ToString(CultureInfo.InvariantCulture),
            }, throwOnError: true);
        }
    }

    /// <summary>Apply a consistent base font to all paragraph text runs while preserving inline HTML formatting such as bold.</summary>
    static void ApplyRuns(
        Wp.Paragraph paragraph,
        string font,
        int halfPoints,
        string? color,
        bool? bold,
        bool? italic)
    {
        foreach (var run in paragraph.Descendants<Wp.Run>())
        {
            var properties = run.RunProperties ?? run.PrependChild(new Wp.RunProperties());
            SetSingleChild(properties, new Wp.RunFonts
            {
                Ascii = font,
                HighAnsi = font,
                EastAsia = font,
                ComplexScript = font,
            });
            SetSingleChild(properties, new Wp.FontSize { Val = halfPoints.ToString(CultureInfo.InvariantCulture) });
            SetSingleChild(properties, new Wp.FontSizeComplexScript { Val = halfPoints.ToString(CultureInfo.InvariantCulture) });
            if (color is not null) SetSingleChild(properties, new Wp.Color { Val = color });
            if (bold.HasValue)
            {
                properties.RemoveAllChildren<Wp.Bold>();
                properties.RemoveAllChildren<Wp.BoldComplexScript>();
                if (bold.Value)
                {
                    properties.AddChild(new Wp.Bold(), throwOnError: true);
                    properties.AddChild(new Wp.BoldComplexScript(), throwOnError: true);
                }
            }
            if (italic.HasValue)
            {
                properties.RemoveAllChildren<Wp.Italic>();
                properties.RemoveAllChildren<Wp.ItalicComplexScript>();
                if (italic.Value)
                {
                    properties.AddChild(new Wp.Italic(), throwOnError: true);
                    properties.AddChild(new Wp.ItalicComplexScript(), throwOnError: true);
                }
            }
        }
    }

    /// <summary>Create a normal text run with the specified font properties.</summary>
    static Wp.Run CreateRun(
        string text,
        string font,
        int halfPoints,
        string color,
        bool bold,
        bool italic)
    {
        var properties = new Wp.RunProperties(
            new Wp.RunFonts { Ascii = font, HighAnsi = font, EastAsia = font, ComplexScript = font });
        if (bold) properties.AppendChild(new Wp.Bold());
        if (italic) properties.AppendChild(new Wp.Italic());
        properties.Append(
            new Wp.Color { Val = color },
            new Wp.FontSize { Val = halfPoints.ToString(CultureInfo.InvariantCulture) },
            new Wp.FontSizeComplexScript { Val = halfPoints.ToString(CultureInfo.InvariantCulture) });
        return new Wp.Run(
            properties,
            new Wp.Text(text) { Space = SpaceProcessingModeValues.Preserve });
    }

    static Wp.StyleRunProperties CreateStyleRunProperties(
        string font,
        int halfPoints,
        bool? bold,
        string? color)
    {
        var properties = new Wp.StyleRunProperties(
            new Wp.RunFonts { Ascii = font, HighAnsi = font, EastAsia = font, ComplexScript = font });
        if (bold == true) properties.AppendChild(new Wp.Bold());
        if (color is not null) properties.AppendChild(new Wp.Color { Val = color });
        properties.Append(
            new Wp.FontSize { Val = halfPoints.ToString(CultureInfo.InvariantCulture) },
            new Wp.FontSizeComplexScript { Val = halfPoints.ToString(CultureInfo.InvariantCulture) });
        return properties;
    }

    static Wp.ParagraphProperties EnsureParagraphProperties(Wp.Paragraph paragraph)
    {
        return paragraph.ParagraphProperties ?? paragraph.PrependChild(new Wp.ParagraphProperties());
    }

    /// <summary>Generate spacing using the new body protocol; cells share only line spacing, retaining 0 before and 4 pt after.</summary>
    static Wp.SpacingBetweenLines CreateBodySpacing(FormatReader format, bool tableCell = false)
    {
        var body = format.Section("body_text");
        var beforeInLines = !tableCell && format.Text(body, "spacing_before_unit", "lines") == "lines";
        var afterInLines = !tableCell && format.Text(body, "spacing_after_unit", "lines") == "lines";
        var before = tableCell ? 0 : format.Number(body, "spacing_before", 0);
        var after = tableCell ? 4 : format.Number(body, "spacing_after", 0);
        var mode = format.Text(body, "line_spacing_mode", "multiple");
        var value = format.Number(body, "line_spacing_value", 1.2);
        var line = mode switch
        {
            "single" => 240,
            "one-and-half" => 360,
            "double" => 480,
            "at-least" or "exact" => value * 20,
            _ => value * 240,
        };
        var spacing = new Wp.SpacingBetweenLines
        {
            // Clamp line spacing only to the minimum native unit; do not raise valid exact/minimum values with a multiple-based lower bound.
            Line = Math.Max(1, (int)Math.Round(line)).ToString(CultureInfo.InvariantCulture),
            LineRule = mode switch
            {
                "at-least" => Wp.LineSpacingRuleValues.AtLeast,
                "exact" => Wp.LineSpacingRuleValues.Exact,
                _ => Wp.LineSpacingRuleValues.Auto,
            },
        };
        // Write line units in hundredths of a line and points in twips; never set both units on the same side.
        var beforeValue = Math.Max(0, (int)Math.Round(before * (beforeInLines ? 100 : 20)));
        var afterValue = Math.Max(0, (int)Math.Round(after * (afterInLines ? 100 : 20)));
        if (beforeInLines) spacing.BeforeLines = beforeValue;
        else spacing.Before = beforeValue.ToString(CultureInfo.InvariantCulture);
        if (afterInLines) spacing.AfterLines = afterValue;
        else spacing.After = afterValue.ToString(CultureInfo.InvariantCulture);
        return spacing;
    }

    /// <summary>Preserve point-based paragraph spacing and multiple line spacing for non-body paragraphs such as headings and captions.</summary>
    static Wp.SpacingBetweenLines CreateSpacing(double beforePoints, double afterPoints, double lineMultiple)
    {
        return new Wp.SpacingBetweenLines
        {
            Before = Math.Max(0, (int)Math.Round(beforePoints * 20)).ToString(CultureInfo.InvariantCulture),
            After = Math.Max(0, (int)Math.Round(afterPoints * 20)).ToString(CultureInfo.InvariantCulture),
            Line = Math.Max(1, (int)Math.Round(Math.Max(0.1, lineMultiple) * 240)).ToString(CultureInfo.InvariantCulture),
            LineRule = Wp.LineSpacingRuleValues.Auto,
        };
    }

    /// <summary>Remove temporary format-identification markers from text nodes.</summary>
    static void RemoveMarker(Wp.Paragraph paragraph, string marker)
    {
        foreach (var text in paragraph.Descendants<Wp.Text>())
        {
            if (text.Text.Contains(marker, StringComparison.Ordinal))
            {
                text.Text = text.Text.Replace(marker, "", StringComparison.Ordinal);
            }
        }
    }

    /// <summary>Keep an image and its immediately following caption on the same page.</summary>
    static void SetImageKeepWithCaption(Wp.Paragraph paragraph)
    {
        var properties = EnsureParagraphProperties(paragraph);
        properties.RemoveAllChildren<Wp.KeepNext>();
        var next = paragraph.NextSibling<Wp.Paragraph>();
        if (next?.InnerText.Contains(FigureCaptionMarker, StringComparison.Ordinal) == true)
        {
            properties.AddChild(new Wp.KeepNext(), throwOnError: true);
        }
    }

    // -- Chapter page frames --------------------------------------------------------
    //
    // Keep headings as top-level paragraphs; body text and business tables share a real table frame.

    /// <summary>Whether chapter page frames are enabled.</summary>
    static bool ChapterFrameEnabled(FormatReader format)
    {
        return format.Bool(format.Section("heading_border"), "enabled", false);
    }

    /// <summary>Paragraph heading level: 1-6 for HeadingN, or 0 for non-headings.</summary>
    static int HeadingLevelOf(OpenXmlElement element)
    {
        if (element is not Wp.Paragraph paragraph) return 0;
        var styleId = paragraph.ParagraphProperties?.ParagraphStyleId?.Val?.Value ?? "";
        if (!styleId.StartsWith("Heading", StringComparison.Ordinal)) return 0;
        return int.TryParse(styleId.AsSpan(7), out var level) && level >= 1 && level <= 6 ? level : 0;
    }

    /// <summary>
    /// Remove page-break properties from the first body paragraph.
    /// Samples begin directly with a top-level heading, while formal exports have preceding title blocks; retaining the break creates a spurious blank preview page,
    /// making the template settings appear incorrect.
    /// </summary>
    static void RemoveLeadingPageBreak(Wp.Body content)
    {
        var first = content.ChildElements.FirstOrDefault(item => item is not Wp.SectionProperties);
        if (first is Wp.Paragraph paragraph)
        {
            paragraph.ParagraphProperties?.RemoveAllChildren<Wp.PageBreakBefore>();
        }
    }

    // -- Top-level headings and flat body tables --------------------------------------------

    /// <summary>Padding between frame vertical lines and text, in twips.</summary>
    const int ChapterFramePaddingTwips = 115;

    /// <summary>Distance from side borders to text, in points. Adding the 0.75-pt line width equals the padding above, aligning vertical lines with text-column edges.</summary>
    const uint ChapterFrameBorderSpacePt = 5;

    /// <summary>Distance between horizontal lines and text, in points.</summary>
    const uint ChapterFrameLineSpacePt = 1;

    /// <summary>Keep headings at body top level; content between headings, sections, or style ranges shares one flat table.</summary>
    static void ApplyChapterFrames(Wp.Body content, FormatReader format, HashSet<Wp.Paragraph> tableCaptions)
    {
        var border = format.Section("heading_border");
        var color = Color(format.Text(border, "border_color", "#cfd8ee"), "CFD8EE");
        var includeHeadings = format.Bool(border, "include_headings", true);
        var headingTopBorderSpacePt = (uint)Math.Max(0, Math.Round(format.Number(border, "heading_top_border_space_pt", ChapterFrameLineSpacePt)));
        var headingBottomBorderSpacePt = (uint)Math.Max(0, Math.Round(format.Number(border, "heading_bottom_border_space_pt", ChapterFrameLineSpacePt)));
        var headingBottomBorderEnabled = format.Bool(border, "heading_bottom_border_enabled", false);
        var pending = new List<OpenXmlElement>();

        // Each call handles only the current style range; do not join body tables across ai-only ranges.
        void FlushContent()
        {
            if (pending.Count == 0) return;
            pending[0].InsertBeforeSelf(CreateChapterBodyTable(pending, format, color, tableCaptions));
            foreach (var element in pending) element.Remove();
            pending.Clear();
        }

        foreach (var element in content.ChildElements.ToList())
        {
            var level = HeadingLevelOf(element);
            if (level > 0)
            {
                FlushContent();
                var paragraph = (Wp.Paragraph)element;
                ApplyChapterFrameParagraph(
                    paragraph,
                    color,
                    Color(format.ArrayText(border, "level_cell_colors", level - 1, "#ffffff"), "FFFFFF"),
                    topLine: true,
                    bottomLine: headingBottomBorderEnabled,
                    topLineSpacePt: headingTopBorderSpacePt,
                    bottomLineSpacePt: headingBottomBorderSpacePt);
                if (!includeHeadings) paragraph.ParagraphProperties!.RemoveAllChildren<Wp.ParagraphBorders>();
            }
            else if (element is Wp.Paragraph { ParagraphProperties.SectionProperties: not null }
                || element is not (Wp.Paragraph or Wp.Table)) FlushContent();
            else pending.Add(element);
        }
        FlushContent();
    }

    /// <summary>
    /// Build a grid from the union of business-table column boundaries; give each body paragraph a full-width row and flatten business tables into sibling rows.
    /// Set table width to 100% of the column so it moves with heading borders after Word margin changes; the export-time grid
    /// provides column proportions only, which Word scales to the new column width.
    /// </summary>
    static Wp.Table CreateChapterBodyTable(IReadOnlyList<OpenXmlElement> content, FormatReader format, string color, HashSet<Wp.Paragraph> captions)
    {
        var width = ContentWidthTwips(format);
        var boundaries = new SortedSet<int> { 0, width };
        var tableBoundaries = new Dictionary<Wp.Table, int[]>();
        for (var index = 0; index < content.Count; index += 1)
        {
            if (content[index] is not Wp.Table table) continue;
            ApplyChapterFrameTableBorders(table, color, format, index > 0 && content[index - 1] is Wp.Paragraph caption && captions.Contains(caption));
            var positions = new List<int> { 0 };
            foreach (var column in table.GetFirstChild<Wp.TableGrid>()!.Elements<Wp.GridColumn>())
            {
                positions.Add(positions[^1] + int.Parse(column.Width!.Value!, CultureInfo.InvariantCulture));
            }
            tableBoundaries.Add(table, positions.ToArray());
            boundaries.UnionWith(positions);
        }

        var grid = boundaries.ToArray();
        var result = new Wp.Table(new Wp.TableProperties(
            new Wp.TableWidth { Type = Wp.TableWidthUnitValues.Pct, Width = "5000" },
            new Wp.TableJustification { Val = Wp.TableRowAlignmentValues.Center },
            new Wp.TableBorders(
                CreateTableBorder<Wp.TopBorder>(color, 6), CreateTableBorder<Wp.LeftBorder>(color, 6),
                CreateTableBorder<Wp.BottomBorder>(color, 6), CreateTableBorder<Wp.RightBorder>(color, 6),
                CreateTableBorder<Wp.InsideHorizontalBorder>(color, 0), CreateTableBorder<Wp.InsideVerticalBorder>(color, 0)),
            new Wp.TableLayout { Type = Wp.TableLayoutValues.Fixed }));
        result.AppendChild(new Wp.TableGrid(grid.Zip(grid.Skip(1), (start, end) =>
            new Wp.GridColumn { Width = (end - start).ToString(CultureInfo.InvariantCulture) })));
        foreach (var element in content)
        {
            if (element is Wp.Paragraph paragraph)
                result.AppendChild(CreateChapterBodyRow(paragraph, grid.Length - 1, color, captions.Contains(paragraph)));
            else if (element is Wp.Table table)
                AppendChapterTableRows(result, table, tableBoundaries[table], grid, color);
        }

        // Close body frames independently; when heading borders are off, do not rely on adjacent paragraphs to draw top/bottom edges.
        foreach (var cell in result.Elements<Wp.TableRow>().First().Elements<Wp.TableCell>())
            SetSingleChild(cell.TableCellProperties!.GetFirstChild<Wp.TableCellBorders>()!, CreateTableBorder<Wp.TopBorder>(color, 6));
        foreach (var cell in result.Elements<Wp.TableRow>().Last().Elements<Wp.TableCell>())
            SetSingleChild(cell.TableCellProperties!.GetFirstChild<Wp.TableCellBorders>()!, CreateTableBorder<Wp.BottomBorder>(color, 6));
        return result;
    }

    /// <summary>Move body padding to cells, preserving first-line indentation, list numbering, images, and existing keep-with-next relationships.</summary>
    static Wp.TableRow CreateChapterBodyRow(Wp.Paragraph source, int columns, string color, bool caption)
    {
        var paragraph = (Wp.Paragraph)source.CloneNode(true);
        var properties = EnsureParagraphProperties(paragraph);
        properties.RemoveAllChildren<Wp.ParagraphBorders>();
        if (caption) properties.GetFirstChild<Wp.SpacingBetweenLines>()!.After = "0";
        var cellProperties = new Wp.TableCellProperties(
            new Wp.GridSpan { Val = columns },
            new Wp.TableCellBorders(
                CreateTableBorder<Wp.TopBorder>(color, caption ? 6U : 0U), CreateTableBorder<Wp.LeftBorder>(color, 6),
                CreateTableBorder<Wp.BottomBorder>(color, caption ? 6U : 0U), CreateTableBorder<Wp.RightBorder>(color, 6)),
            new Wp.TableCellMargin(
                new Wp.TopMargin { Width = "0", Type = Wp.TableWidthUnitValues.Dxa },
                new Wp.LeftMargin { Width = ChapterFramePaddingTwips.ToString(CultureInfo.InvariantCulture), Type = Wp.TableWidthUnitValues.Dxa },
                new Wp.BottomMargin { Width = "0", Type = Wp.TableWidthUnitValues.Dxa },
                new Wp.RightMargin { Width = ChapterFramePaddingTwips.ToString(CultureInfo.InvariantCulture), Type = Wp.TableWidthUnitValues.Dxa }));
        return new Wp.TableRow(new Wp.TableCell(cellProperties, paragraph));
    }

    /// <summary>Flatten business tables onto the shared grid, preserving merges and moving table-level borders/padding into cells.</summary>
    static void AppendChapterTableRows(Wp.Table target, Wp.Table source, int[] sourceGrid, int[] grid, string color)
    {
        var tableProperties = source.GetFirstChild<Wp.TableProperties>()!;
        var tableBorders = tableProperties.GetFirstChild<Wp.TableBorders>()!;
        var tableMargins = tableProperties.GetFirstChild<Wp.TableCellMarginDefault>()!;
        var rows = source.Elements<Wp.TableRow>().ToList();
        for (var rowIndex = 0; rowIndex < rows.Count; rowIndex += 1)
        {
            var row = (Wp.TableRow)rows[rowIndex].CloneNode(true);
            // Disable repeated page headers but keep header rows unsplittable; body rows may still span pages.
            row.TableRowProperties?.RemoveAllChildren<Wp.TableHeader>();
            var column = 0;
            foreach (var cell in row.Elements<Wp.TableCell>())
            {
                var properties = cell.TableCellProperties ?? cell.PrependChild(new Wp.TableCellProperties());
                var span = properties.GridSpan?.Val?.Value ?? 1;
                var endColumn = column + span;
                SetSingleChild(properties, new Wp.GridSpan { Val = Array.BinarySearch(grid, sourceGrid[endColumn]) - Array.BinarySearch(grid, sourceGrid[column]) });
                properties.RemoveAllChildren<Wp.TableCellWidth>();
                var borders = properties.GetFirstChild<Wp.TableCellBorders>() ?? AddChild(properties, new Wp.TableCellBorders());
                SetSingleChild(borders, CopyChapterCellBorder<Wp.TopBorder>(borders.GetFirstChild<Wp.TopBorder>() ?? (rowIndex == 0 ? tableBorders.GetFirstChild<Wp.TopBorder>() : (Wp.BorderType?)tableBorders.GetFirstChild<Wp.InsideHorizontalBorder>())));
                SetSingleChild(borders, column == 0 ? CreateTableBorder<Wp.LeftBorder>(color, 6) : CopyChapterCellBorder<Wp.LeftBorder>(borders.GetFirstChild<Wp.LeftBorder>() ?? (Wp.BorderType?)tableBorders.GetFirstChild<Wp.InsideVerticalBorder>()));
                SetSingleChild(borders, CopyChapterCellBorder<Wp.BottomBorder>(borders.GetFirstChild<Wp.BottomBorder>() ?? (rowIndex == rows.Count - 1 ? tableBorders.GetFirstChild<Wp.BottomBorder>() : (Wp.BorderType?)tableBorders.GetFirstChild<Wp.InsideHorizontalBorder>())));
                SetSingleChild(borders, endColumn == sourceGrid.Length - 1 ? CreateTableBorder<Wp.RightBorder>(color, 6) : CopyChapterCellBorder<Wp.RightBorder>(borders.GetFirstChild<Wp.RightBorder>() ?? (Wp.BorderType?)tableBorders.GetFirstChild<Wp.InsideVerticalBorder>()));
                var margins = properties.GetFirstChild<Wp.TableCellMargin>() ?? AddChild(properties, new Wp.TableCellMargin());
                SetMissingChapterMargin(margins, new Wp.TopMargin(), tableMargins.GetFirstChild<Wp.TopMargin>()!);
                SetMissingChapterMargin(margins, new Wp.LeftMargin(), tableMargins.GetFirstChild<Wp.TableCellLeftMargin>()!);
                SetMissingChapterMargin(margins, new Wp.BottomMargin(), tableMargins.GetFirstChild<Wp.BottomMargin>()!);
                SetMissingChapterMargin(margins, new Wp.RightMargin(), tableMargins.GetFirstChild<Wp.TableCellRightMargin>()!);
                column = endColumn;
            }
            target.AppendChild(row);
        }
    }

    /// <summary>Convert internal horizontal/vertical lines to corresponding cell borders, preserving color, style, and thickness.</summary>
    static T CopyChapterCellBorder<T>(Wp.BorderType? source) where T : Wp.BorderType, new()
    {
        var result = new T();
        if (source is null) result.Val = Wp.BorderValues.Nil;
        else result.SetAttributes(source.GetAttributes());
        return result;
    }

    /// <summary>Fill in only padding previously inherited from business tables; preserve cells' own settings.</summary>
    static void SetMissingChapterMargin<T>(Wp.TableCellMargin margins, T margin, OpenXmlElement source) where T : OpenXmlElement
    {
        if (margins.GetFirstChild<T>() is not null) return;
        margin.SetAttributes(source.GetAttributes());
        margins.AddChild(margin, throwOnError: true);
    }

    /// <summary>Preserve standalone heading borders, shading, and side padding.</summary>
    static void ApplyChapterFrameParagraph(
        Wp.Paragraph paragraph,
        string color,
        string? fill,
        bool topLine,
        bool bottomLine,
        uint topLineSpacePt,
        uint bottomLineSpacePt)
    {
        var properties = EnsureParagraphProperties(paragraph);
        SetSingleChild(properties, CreateChapterFrameBorders(color, topLine, bottomLine, topLineSpacePt, bottomLineSpacePt));
        if (bottomLine && fill is null) properties.GetFirstChild<Wp.SpacingBetweenLines>()!.After = "0";

        if (fill is null) properties.RemoveAllChildren<Wp.Shading>();
        else SetSingleChild(properties, new Wp.Shading { Val = Wp.ShadingPatternValues.Clear, Fill = fill });

        var indentation = properties.GetFirstChild<Wp.Indentation>();
        if (indentation is null)
        {
            indentation = new Wp.Indentation();
            properties.AddChild(indentation, throwOnError: true);
        }

        // First-line indentation is already in w:ind; add only side padding. Numbered paragraphs retain the numbering definition's left indent.
        if (properties.GetFirstChild<Wp.NumberingProperties>() is null)
        {
            indentation.Left = AddTwips(indentation.Left, ChapterFramePaddingTwips);
        }

        indentation.Right = AddTwips(indentation.Right, ChapterFramePaddingTwips);
    }

    /// <summary>Page-frame borders; OOXML schema child order is top / left / bottom / right.</summary>
    static Wp.ParagraphBorders CreateChapterFrameBorders(string color, bool topLine, bool bottomLine = false, uint topLineSpacePt = ChapterFrameLineSpacePt, uint bottomLineSpacePt = ChapterFrameLineSpacePt)
    {
        var borders = new Wp.ParagraphBorders();
        if (topLine) borders.AppendChild(CreateFrameBorder<Wp.TopBorder>(color, topLineSpacePt));
        borders.AppendChild(CreateFrameBorder<Wp.LeftBorder>(color, ChapterFrameBorderSpacePt));
        if (bottomLine) borders.AppendChild(CreateFrameBorder<Wp.BottomBorder>(color, bottomLineSpacePt));
        borders.AppendChild(CreateFrameBorder<Wp.RightBorder>(color, ChapterFrameBorderSpacePt));
        return borders;
    }

    static string AddTwips(StringValue? value, int delta)
    {
        var current = int.TryParse(value?.Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : 0;
        return (current + delta).ToString(CultureInfo.InvariantCulture);
    }

    static T CreateFrameBorder<T>(string color, uint spacePt) where T : Wp.BorderType, new()
    {
        return new T
        {
            Val = Wp.BorderValues.Single,
            Color = color,
            Size = 6,
            Space = spacePt,
        };
    }

    /// <summary>Available body column width; the width of one column in a two-column layout.</summary>
    static int ContentWidthTwips(FormatReader format)
    {
        var page = format.Section("page");
        var paper = PaperSizes.TryGetValue(format.Text(page, "paper_size", "a4"), out var found)
            ? found
            : PaperSizes["a4"];
        var landscape = format.Text(page, "orientation", "portrait") == "landscape";
        var width = MmToTwips(landscape ? paper.Height : paper.Width);
        var text = width
            - CmToTwips(format.Number(page, "margin_left_cm", 2))
            - CmToTwips(format.Number(page, "margin_right_cm", 2));
        // Use the same column condition as BuildSectionProperties: columns apply only in landscape, with a fixed 720 gap.
        if (landscape && format.Bool(page, "two_column", false)) text = (text - 720) / 2;
        return Math.Max(1, text);
    }

    /// <summary>
    /// Force business tables inside page frames to full column width and take over side borders; omit the table top border when the caption already supplies it.
    /// </summary>
    static void ApplyChapterFrameTableBorders(Wp.Table table, string color, FormatReader format, bool captioned)
    {
        var properties = table.GetFirstChild<Wp.TableProperties>() ?? table.PrependChild(new Wp.TableProperties());
        var width = ContentWidthTwips(format);
        SetSingleChild(properties, new Wp.TableWidth
        {
            Type = Wp.TableWidthUnitValues.Dxa,
            Width = width.ToString(CultureInfo.InvariantCulture),
        });
        SetSingleChild(properties, new Wp.TableLayout { Type = Wp.TableLayoutValues.Fixed });

        // Match tableColumnWidths in exportService.cjs: divide logical columns evenly and add the remainder to the last column.
        var columnCount = table.Elements<Wp.TableRow>().Max(row => row.Elements<Wp.TableCell>()
            .Sum(cell => cell.TableCellProperties?.GridSpan?.Val?.Value ?? 1));
        var columnWidth = width / columnCount;
        var grid = new Wp.TableGrid();
        for (var index = 0; index < columnCount; index += 1)
        {
            grid.AppendChild(new Wp.GridColumn
            {
                Width = (columnWidth + (index == columnCount - 1 ? width % columnCount : 0))
                    .ToString(CultureInfo.InvariantCulture),
            });
        }
        SetSingleChild(table, grid);
        // The new grid controls column widths; remove old converter preferred widths while preserving column/row spans.
        foreach (var cell in table.Elements<Wp.TableRow>().SelectMany(row => row.Elements<Wp.TableCell>()))
        {
            cell.TableCellProperties?.RemoveAllChildren<Wp.TableCellWidth>();
        }

        var borders = properties.GetFirstChild<Wp.TableBorders>();
        if (borders is null)
        {
            borders = new Wp.TableBorders();
            properties.AddChild(borders, throwOnError: true);
        }

        SetSingleChild(borders, CreateTableBorder<Wp.LeftBorder>(color, 6));
        SetSingleChild(borders, CreateTableBorder<Wp.RightBorder>(color, 6));
        // The caption's bottom border already forms the table top edge; avoid overlapping horizontal lines.
        if (captioned) SetSingleChild(borders, CreateTableBorder<Wp.TopBorder>(color, 0));
    }

    /// <summary>Use continuous sections to place top-level headings across both columns in two-column documents.</summary>
    static void ApplyTwoColumnHeadingSections(
        MainDocumentPart mainPart,
        Wp.Body content,
        FormatReader format)
    {
        var page = format.Section("page");
        if (format.Text(page, "orientation", "portrait") != "landscape"
            || !format.Bool(page, "two_column", false)) return;
        var finalSection = mainPart.Document.Body?.Elements<Wp.SectionProperties>().LastOrDefault();
        if (finalSection is null) return;

        var headings = content.Elements<Wp.Paragraph>()
            .Where(item => item.ParagraphProperties?.ParagraphStyleId?.Val?.Value == "Heading1")
            .ToList();
        var startPropertiesAvailable = true;
        foreach (var heading in headings)
        {
            var hasPriorContent = content.ChildElements
                .TakeWhile(item => !ReferenceEquals(item, heading))
                .Any(item => item is Wp.Table || !string.IsNullOrWhiteSpace(item.InnerText));
            if (hasPriorContent)
            {
                heading.InsertBeforeSelf(new Wp.Paragraph(
                    new Wp.ParagraphProperties(CreateContinuousSection(
                        finalSection,
                        columnCount: 2,
                        includeDocumentStart: startPropertiesAvailable))));
                startPropertiesAvailable = false;
            }

            var properties = EnsureParagraphProperties(heading);
            properties.RemoveAllChildren<Wp.SectionProperties>();
            properties.AppendChild(CreateContinuousSection(
                finalSection,
                columnCount: 1,
                includeDocumentStart: startPropertiesAvailable));
            startPropertiesAvailable = false;
        }

        if (headings.Count == 0) return;
        // Two-column body text after top-level headings remains a continuous section; default nextPage would push the last chapter body to the next page.
        SetSingleChild(finalSection, new Wp.SectionType { Val = Wp.SectionMarkValues.Continuous });
        finalSection.RemoveAllChildren<Wp.TitlePage>();
        finalSection.RemoveAllChildren<Wp.PageNumberType>();
    }

    /// <summary>Copy page and header/footer settings, replacing only the continuous section's column count.</summary>
    static Wp.SectionProperties CreateContinuousSection(
        Wp.SectionProperties source,
        int columnCount,
        bool includeDocumentStart)
    {
        var section = (Wp.SectionProperties)source.CloneNode(true);
        section.RemoveAllChildren<Wp.SectionType>();
        section.RemoveAllChildren<Wp.Columns>();
        if (!includeDocumentStart)
        {
            section.RemoveAllChildren<Wp.TitlePage>();
            section.RemoveAllChildren<Wp.PageNumberType>();
        }

        var pageSize = section.GetFirstChild<Wp.PageSize>();
        InsertBefore(section, new Wp.SectionType { Val = Wp.SectionMarkValues.Continuous }, pageSize);
        var titlePage = section.GetFirstChild<Wp.TitlePage>();
        InsertBefore(section, new Wp.Columns { ColumnCount = (short)columnCount, Space = "720" }, titlePage);
        return section;
    }

    static Wp.ParagraphBorders CreateParagraphBorders(
        string color,
        bool topOnly,
        bool sidesOnly,
        uint size = 6)
    {
        var borders = new Wp.ParagraphBorders();
        if (topOnly)
        {
            borders.AppendChild(new Wp.TopBorder { Val = Wp.BorderValues.Single, Color = color, Size = size, Space = 1U });
            return borders;
        }
        if (sidesOnly)
        {
            borders.Append(
                new Wp.LeftBorder { Val = Wp.BorderValues.Single, Color = color, Size = size, Space = 2U },
                new Wp.RightBorder { Val = Wp.BorderValues.Single, Color = color, Size = size, Space = 2U });
            return borders;
        }
        borders.Append(
            new Wp.TopBorder { Val = Wp.BorderValues.Single, Color = color, Size = size, Space = 1U },
            new Wp.LeftBorder { Val = Wp.BorderValues.Single, Color = color, Size = size, Space = 2U },
            new Wp.BottomBorder { Val = Wp.BorderValues.Single, Color = color, Size = size, Space = 1U },
            new Wp.RightBorder { Val = Wp.BorderValues.Single, Color = color, Size = size, Space = 2U });
        return borders;
    }

    static void InsertBefore<T>(OpenXmlCompositeElement parent, T child, OpenXmlElement? anchor)
        where T : OpenXmlElement
    {
        if (anchor is null) parent.AppendChild(child);
        else parent.InsertBefore(child, anchor);
    }

    static T CreateTableBorder<T>(string color, uint size) where T : Wp.BorderType, new()
    {
        return new T
        {
            Val = size == 0 ? Wp.BorderValues.Nil : Wp.BorderValues.Single,
            Color = color,
            Size = size,
        };
    }

    static void SetSingleChild<T>(OpenXmlCompositeElement parent, T child) where T : OpenXmlElement
    {
        parent.RemoveAllChildren<T>();
        parent.AddChild(child, throwOnError: true);
    }

    static T AddChild<T>(OpenXmlCompositeElement parent, T child) where T : OpenXmlElement
    {
        parent.AddChild(child, throwOnError: true);
        return child;
    }

    static Wp.JustificationValues Alignment(string value)
    {
        return value switch
        {
            "居中对齐" => Wp.JustificationValues.Center,
            "右对齐" => Wp.JustificationValues.Right,
            "两端对齐" => Wp.JustificationValues.Both,
            _ => Wp.JustificationValues.Left,
        };
    }

    static string Color(string value, string fallback)
    {
        var normalized = (value ?? "").Trim().TrimStart('#');
        return normalized.Length == 6 && normalized.All(Uri.IsHexDigit)
            ? normalized.ToUpperInvariant()
            : fallback;
    }

    static int FontHalfPoints(string size)
    {
        return Math.Max(1, (int)Math.Round((ChineseFontSizes.TryGetValue(size, out var points) ? points : 12) * 2));
    }

    static int CharsToTwips(double chars, int halfPoints)
    {
        return Math.Max(0, (int)Math.Round(chars * Math.Max(1, halfPoints) * 10));
    }

    static int CmToTwips(double value) => Math.Max(0, (int)Math.Round(value * 567));

    /// <summary>Convert cm to twips without clamping the sign. Decoration text reaches page edges, so indentation must allow negative values.</summary>
    static int CmToTwipsSigned(double value) => (int)Math.Round(value * 567);

    static long CmToEmu(double value) => (long)Math.Round(value * 360000);

    /// <summary>Paper size in cm, already swapped for orientation.</summary>
    static (double Width, double Height) ResolvePaperSize(FormatReader format)
    {
        var page = format.Section("page");
        var paper = PaperSizes.TryGetValue(format.Text(page, "paper_size", "a4"), out var found)
            ? found
            : PaperSizes["a4"];
        var landscape = format.Text(page, "orientation", "portrait") == "landscape";
        return landscape
            ? (paper.Height / 10.0, paper.Width / 10.0)
            : (paper.Width / 10.0, paper.Height / 10.0);
    }
    static int MmToTwips(double value) => Math.Max(1, (int)Math.Round(value * 56.7));

    /// <summary>Format heading-level counters as display numbers using template placeholders.</summary>
    static string FormatHeadingNumber(IReadOnlyList<int> rawParts, JsonElement heading)
    {
        var parts = rawParts.Where(item => item > 0).ToArray();
        if (parts.Length == 0) return "";
        var format = FormatReader.GetText(heading, "numbering_format", "custom");
        if (format == "outline-decimal") return string.Join('.', parts);
        if (format != "custom") return "";

        var last = parts[^1];
        var result = FormatReader.GetText(heading, "numbering_template", "");
        for (var level = 1; level <= 6; level += 1)
        {
            var tail = level <= parts.Length ? string.Join('.', parts[(level - 1)..]) : "";
            result = result.Replace($"{{tail{level}}}", tail, StringComparison.Ordinal);
        }
        var genericTail = parts.Length >= 3 ? string.Join('.', parts[2..]) : last.ToString(CultureInfo.InvariantCulture);
        return result
            .Replace("{zh}", NumberToChinese(last), StringComparison.Ordinal)
            .Replace("{num}", last.ToString(CultureInfo.InvariantCulture), StringComparison.Ordinal)
            .Replace("{tail}", genericTail, StringComparison.Ordinal)
            .Replace("{full}", string.Join('.', parts), StringComparison.Ordinal)
            .Replace("{circled}", NumberToCircled(last), StringComparison.Ordinal)
            .Replace("{alpha}", NumberToAlpha(last, false), StringComparison.Ordinal)
            .Replace("{ALPHA}", NumberToAlpha(last, true), StringComparison.Ordinal)
            .Replace("{roman}", NumberToRoman(last, false), StringComparison.Ordinal)
            .Replace("{ROMAN}", NumberToRoman(last, true), StringComparison.Ordinal)
            .Trim();
    }

    static bool NeedsSpace(string value)
    {
        return value.Length > 0 && !"、，。；：）)】]》〉".Contains(value[^1]);
    }

    static string NumberToChinese(int value)
    {
        string[] digits = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
        value = Math.Clamp(value, 1, 9999);
        if (value < 10) return digits[value];
        if (value < 20) return $"十{(value == 10 ? "" : digits[value - 10])}";
        if (value < 100) return $"{digits[value / 10]}十{digits[value % 10]}";
        if (value < 1000)
        {
            var rest = value % 100;
            return $"{digits[value / 100]}百{(rest == 0 ? "" : rest < 10 ? $"零{digits[rest]}" : NumberToChinese(rest))}";
        }
        var remainder = value % 1000;
        return $"{digits[value / 1000]}千{(remainder == 0 ? "" : remainder < 100 ? $"零{NumberToChinese(remainder)}" : NumberToChinese(remainder))}";
    }

    static string NumberToCircled(int value)
    {
        string[] values = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳"];
        return value is >= 1 and <= 20 ? values[value - 1] : value.ToString(CultureInfo.InvariantCulture);
    }

    static string NumberToAlpha(int value, bool upper)
    {
        var number = Math.Max(1, value);
        var result = "";
        while (number > 0)
        {
            number -= 1;
            result = (char)('a' + number % 26) + result;
            number /= 26;
        }
        return upper ? result.ToUpperInvariant() : result;
    }

    static string NumberToRoman(int value, bool upper)
    {
        (int Value, string Text)[] pairs =
        [
            (1000, "m"), (900, "cm"), (500, "d"), (400, "cd"),
            (100, "c"), (90, "xc"), (50, "l"), (40, "xl"),
            (10, "x"), (9, "ix"), (5, "v"), (4, "iv"), (1, "i"),
        ];
        var number = Math.Clamp(value, 1, 3999);
        var result = "";
        foreach (var pair in pairs)
        {
            while (number >= pair.Value)
            {
                result += pair.Text;
                number -= pair.Value;
            }
        }
        return upper ? result.ToUpperInvariant() : result;
    }

    sealed record PreparedHtml(IDocument Document, IReadOnlyList<TableSpec> Tables);
    sealed record TableSpec(IReadOnlyList<TableRowSpec> Rows);
    sealed record TableRowSpec(bool IsHeaderRow, IReadOnlyList<CellRole> Cells);
    enum CellRole { Header, FirstColumn, Body }

    /// <summary>Read frontend export_format lightly, using current template defaults for missing values.</summary>
    sealed class FormatReader
    {
        public FormatReader(JsonElement root)
        {
            Root = root.Clone();
        }

        public JsonElement Root { get; }

        public JsonElement Section(string name) => Child(Root, name);

        public JsonElement Heading(int level)
        {
            if (!Root.TryGetProperty("headings", out var headings)
                || headings.ValueKind != JsonValueKind.Array
                || level < 1
                || level > headings.GetArrayLength())
            {
                return default;
            }
            return headings[level - 1];
        }

        public JsonElement Child(JsonElement parent, string name)
        {
            return parent.ValueKind == JsonValueKind.Object && parent.TryGetProperty(name, out var value)
                ? value
                : default;
        }

        public string Text(JsonElement parent, string name, string fallback) => GetText(parent, name, fallback);

        public static string GetText(JsonElement parent, string name, string fallback)
        {
            return parent.ValueKind == JsonValueKind.Object
                && parent.TryGetProperty(name, out var value)
                && value.ValueKind == JsonValueKind.String
                    ? value.GetString() ?? fallback
                    : fallback;
        }

        public double Number(JsonElement parent, string name, double fallback)
        {
            return parent.ValueKind == JsonValueKind.Object
                && parent.TryGetProperty(name, out var value)
                && value.ValueKind == JsonValueKind.Number
                && value.TryGetDouble(out var number)
                    ? number
                    : fallback;
        }

        public int Integer(JsonElement parent, string name, int fallback)
        {
            return parent.ValueKind == JsonValueKind.Object
                && parent.TryGetProperty(name, out var value)
                && value.ValueKind == JsonValueKind.Number
                && value.TryGetInt32(out var number)
                    ? number
                    : fallback;
        }

        public bool Bool(JsonElement parent, string name, bool fallback)
        {
            if (parent.ValueKind != JsonValueKind.Object || !parent.TryGetProperty(name, out var value)) return fallback;
            return value.ValueKind switch
            {
                JsonValueKind.True => true,
                JsonValueKind.False => false,
                _ => fallback,
            };
        }

        public string ArrayText(JsonElement parent, string name, int index, string fallback)
        {
            if (parent.ValueKind != JsonValueKind.Object
                || !parent.TryGetProperty(name, out var values)
                || values.ValueKind != JsonValueKind.Array
                || index < 0
                || index >= values.GetArrayLength()
                || values[index].ValueKind != JsonValueKind.String)
            {
                return fallback;
            }
            return values[index].GetString() ?? fallback;
        }
    }
}
