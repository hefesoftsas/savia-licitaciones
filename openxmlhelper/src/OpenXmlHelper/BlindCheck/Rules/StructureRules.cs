using System.Text.RegularExpressions;
using System.Xml.Linq;
using Savia.OpenXmlHelper.BlindCheck.Model;
using Savia.OpenXmlHelper.BlindCheck.Ooxml;

namespace Savia.OpenXmlHelper.BlindCheck.Rules;

/// <summary>
/// Structure and metadata: revisions, comments, headers/footers, page numbers, contents, text boxes, hyperlinks, field codes, document properties, and empty paragraphs.
/// A leftover page number, unaccepted revision, or company-named header can directly disqualify an anonymous bid.
/// </summary>
static class StructureRules
{
    static readonly HashSet<string> RevisionNames =
    [
        "ins", "del", "moveFrom", "moveTo", "pPrChange", "rPrChange", "tblPrChange", "tcPrChange",
        "trPrChange", "sectPrChange", "numberingChange", "tblGridChange", "cellIns", "cellDel", "cellMerge",
    ];

    public static readonly HashSet<string> SuspectFields =
    [
        "filename", "author", "company", "username", "useraddress", "userinitials", "docproperty",
        "info", "createdate", "savedate", "lastsavedby", "template",
    ];

    public static readonly HashSet<string> PageFields = ["page", "numpages", "sectionpages"];
    public static readonly HashSet<string> DefaultTemplates = new(StringComparer.OrdinalIgnoreCase) { "Normal.dotm", "Normal.dot", "Normal", "Normal.wpt", "normal.dotx" };
    public static readonly HashSet<string> BenignCustomProperties = new(StringComparer.OrdinalIgnoreCase) { "KSOProductBuildVer" };

    static readonly Regex PageNumberText = new(@"^\s*(第\s*\d+\s*页(\s*[,，]?\s*共\s*\d+\s*页)?|Page\s*\d+(\s*of\s*\d+)?)\s*$", RegexOptions.IgnoreCase);
    static readonly Regex PageNumberOnly = new(@"^[\s\d第页共/／\-—–_.,，|]*$|^\s*page\s*\d+(\s*of\s*\d+)?\s*$", RegexOptions.IgnoreCase);
    public static readonly Regex QuotedTarget = new("\"([^\"]+)\"");
    public static readonly string[] BorderSides = ["top", "left", "bottom", "right", "between", "bar"];

    public static IEnumerable<RuleSpec> All()
    {
        yield return new RuleSpec { Id = "struct.revision", Title = "未接受的修订", Category = "structure", Severity = Severity.High, Whole = CheckRevisions };
        yield return new RuleSpec { Id = "struct.comment", Title = "批注", Category = "structure", Severity = Severity.High, Whole = CheckComments };
        yield return new RuleSpec { Id = "struct.header_footer", Title = "页眉页脚内容", Category = "structure", Severity = Severity.High, Whole = CheckHeaderFooter };
        yield return new RuleSpec { Id = "struct.empty_paragraph", Title = "空段落", Category = "structure", Severity = Severity.Medium, Whole = CheckEmptyParagraphs };
        yield return new RuleSpec { Id = "struct.page_number_text", Title = "正文页码文字与缺少页码", Category = "structure", Severity = Severity.Medium, Whole = CheckPageNumberText };
        yield return new RuleSpec { Id = "struct.toc", Title = "目录", Category = "structure", Severity = Severity.Medium, Whole = CheckToc };
        yield return new RuleSpec { Id = "struct.heading_number", Title = "标题序号格式", Category = "structure", Severity = Severity.Medium, Whole = CheckHeadingNumberFormat };
        yield return new RuleSpec { Id = "struct.textbox", Title = "文本框", Category = "structure", Severity = Severity.Low, Whole = CheckTextbox };
        yield return new RuleSpec { Id = "struct.bookmark", Title = "命名书签", Category = "structure", Severity = Severity.Low, Whole = CheckBookmarks };
        yield return new RuleSpec { Id = "struct.hyperlink", Title = "超链接", Category = "privacy", Severity = Severity.High, Whole = CheckHyperlinks };
        yield return new RuleSpec { Id = "struct.field", Title = "域代码", Category = "privacy", Severity = Severity.High, Whole = CheckFields };
        yield return new RuleSpec { Id = "struct.doc_props", Title = "文档属性", Category = "privacy", Severity = Severity.High, Whole = CheckDocumentProperties };
    }

    static IEnumerable<Finding> CheckRevisions(RuleContext context, RuleSpec rule)
    {
        if (!context.Profile.Bool("structure.check_revisions", true)) yield break;
        foreach (var (part, document) in context.Model.Parts)
        {
            var counts = new Dictionary<string, int>(StringComparer.Ordinal);
            foreach (var element in document.Descendants())
            {
                if (element.Name.Namespace != W.Ns || !RevisionNames.Contains(element.Name.LocalName)) continue;
                var label = element.Name.LocalName switch
                {
                    "ins" => "插入",
                    "del" => "删除",
                    "moveFrom" or "moveTo" => "移动",
                    _ => "格式修改",
                };
                counts[label] = counts.GetValueOrDefault(label) + 1;
            }

            if (counts.Count == 0) continue;
            var detail = string.Join("、", counts.Select(item => $"{item.Key} {item.Value} 处"));
            yield return context.Global(rule, "存在未接受的修订", context.PartLabel(part),
                $"{detail}。未接受的修订会暴露修改痕迹，评审时可能显示被删除的内容",
                "审阅 → 接受 → 接受所有修订，并关闭「修订」");
        }
    }

    static IEnumerable<Finding> CheckComments(RuleContext context, RuleSpec rule)
    {
        if (!context.Profile.Bool("structure.check_comments", true) || context.Model.CommentsPart is not { } part) yield break;
        var comments = context.Model.Parts[part].Root?.Elements(W.Comment).ToList() ?? [];
        if (comments.Count == 0) yield break;
        var authors = comments.Select(item => W.Attr(item, "author")).Where(item => !string.IsNullOrWhiteSpace(item)).Distinct().ToList();
        yield return context.Global(rule, "文档残留批注", "批注",
            $"共 {comments.Count} 条批注，批注作者：{(authors.Count > 0 ? string.Join("、", authors) : "未知")}。批注会暴露作者和单位信息",
            "审阅 → 删除 → 删除文档中的所有批注");
    }

    static IEnumerable<Finding> CheckHeaderFooter(RuleContext context, RuleSpec rule)
    {
        if (!context.Profile.Bool("structure.check_header_footer", true)) yield break;
        var pageMode = context.Profile.Text("structure.page_number");
        foreach (var part in context.Model.HeaderParts.Concat(context.Model.FooterParts))
        {
            var root = context.Model.Parts[part].Root;
            if (root is null) continue;
            var isHeader = context.Model.HeaderParts.Contains(part);
            var label = context.PartLabel(part);
            var place = isHeader ? "页眉" : "页脚";
            // The DrawingML primary text box and VML fallback each contain a page-number field; count them once.
            var pageFields = FieldScanner.Scan(root).Count(field => PageFields.Contains(field.Kind) && field.Begin?.Ancestors(W.McFallback).Any() != true);
            var pageAllowed = PageNumberAllowed(pageMode, isHeader);
            if (!pageAllowed && pageFields > 0)
            {
                yield return context.Global(rule, $"{place}中存在页码", label,
                    pageMode == "footer_only" ? $"发现 {pageFields} 处页码域，招标文件要求页码只出现在页脚" : $"发现 {pageFields} 处页码域，暗标通常要求不出现页码",
                    $"双击{place}区域，删除页码");
            }

            if (!ContentForbidden(context.Profile, pageMode, isHeader)) continue;
            var texts = HeaderFooterMarks(context.Model.Sheet, root, pageFields > 0);
            if (texts.Count == 0) continue;
            var content = RuleContext.Truncate(string.Join(" / ", texts.Take(4)), 80);
            yield return context.Global(rule, $"{place}存在内容", label,
                !isHeader && pageMode == "footer_only"
                    ? $"内容：{content}。招标文件要求页脚只出现页码"
                    : $"内容：{content}。页眉页脚常残留企业名称或标志，暗标要求清空",
                pageAllowed ? $"双击{place}，只保留页码，删除其他内容（含图片和横线）" : $"双击{place}，删除全部内容（含图片和横线）", content);
        }
    }

    /// <summary>Page-number requirement (structure.page_number): forbid prohibits page numbers; footer_only permits only page numbers in footers; null is unrestricted.</summary>
    public static bool PageNumberAllowed(string? pageMode, bool isHeader)
    {
        return pageMode != "forbid" && !(pageMode == "footer_only" && isHeader);
    }

    /// <summary>Whether headers/footers forbid content other than page numbers; footers always forbid it under the page-numbers-only requirement.</summary>
    public static bool ContentForbidden(BlindCheckProfile profile, string? pageMode, bool isHeader)
    {
        return isHeader
            ? profile.Bool("structure.forbid_header_content", true)
            : profile.Bool("structure.forbid_footer_content", true) || pageMode == "footer_only";
    }

    /// <summary>Header/footer text and objects other than page numbers; with page-number fields, paragraphs containing only page numbers are numbers, not content.</summary>
    public static List<string> HeaderFooterContent(XElement element, bool hasPageFields)
    {
        return HeaderFooterTexts(element).Where(text => !hasPageFields || !PageNumberOnly.IsMatch(text)).ToList();
    }

    /// <summary>
    /// Checks and fixes share the same visible header/footer content definition: text, objects, and visible paragraph borders represented as "[horizontal line]".
    /// (The Chinese Word Header style includes a bottom border that remains at the top of each page after deleting all text.) Count tables by their text.
    /// </summary>
    public static List<string> HeaderFooterMarks(StyleSheet sheet, XElement root, bool hasPageFields)
    {
        var contents = HeaderFooterContent(root, hasPageFields);
        if (BorderedParagraphs(sheet, root).Any()) contents.Add("[横线]");
        return contents;
    }

    /// <summary>Paragraphs displaying borders; text-box paragraphs count with the text box rather than separately.</summary>
    public static IEnumerable<XElement> BorderedParagraphs(StyleSheet sheet, XElement element)
    {
        return element.DescendantsAndSelf(W.P)
            .Where(paragraph => !paragraph.Ancestors().Any(item => item.Name == W.TxbxContent || item.Name == W.VTxbxContent) && HasVisibleBorder(sheet, paragraph));
    }

    /// <summary>Effective paragraph borders: check direct settings per side, then the paragraph style chain; nil and none mean no border.</summary>
    static bool HasVisibleBorder(StyleSheet sheet, XElement paragraph)
    {
        var properties = paragraph.Element(W.PPr);
        var style = sheet.ResolveParagraphStyle(W.ValOf(properties?.Element(W.PStyle)));
        var layers = new[] { properties }.Concat(sheet.Chain(style, "paragraph").Select(item => item.PPr))
            .Select(item => item?.Element(W.Ns + "pBdr"))
            .OfType<XElement>()
            .ToList();
        return BorderSides.Any(side => layers.Select(layer => layer.Element(W.Ns + side)).FirstOrDefault(item => item is not null) is { } border
            && W.ValOf(border) is not (null or "nil" or "none"));
    }

    /// <summary>
    /// Visible header/footer paragraph text: text boxes contribute their text (WPS page numbers are text boxes containing only a page-number field),
    /// and other objects such as images use "[image]"; text-box paragraphs are included with their object, not listed separately.
    /// </summary>
    public static IEnumerable<string> HeaderFooterTexts(XElement element)
    {
        foreach (var paragraph in element.DescendantsAndSelf(W.P))
        {
            if (paragraph.Ancestors().Any(item => item.Name == W.TxbxContent || item.Name == W.VTxbxContent)) continue;
            var text = string.Concat(DocumentModel.RenderedRuns(paragraph).SelectMany(run => run.Elements()).Select(ObjectAwareText)).Trim();
            if (text.Length > 0) yield return text;
        }
    }

    static string ObjectAwareText(XElement child)
    {
        var text = DocumentModel.PieceText(child);
        if (text != DocumentModel.ObjectPlaceholder.ToString()) return text;
        return DocumentModel.TextboxContents(child).FirstOrDefault() is { } textbox
            ? string.Concat(textbox.Descendants(W.P).Select(DocumentModel.ParagraphText)).Trim()
            : "[图片]";
    }

    static IEnumerable<Finding> CheckEmptyParagraphs(RuleContext context, RuleSpec rule)
    {
        if (!context.Profile.Bool("structure.check_empty_paragraphs", true)) yield break;
        var model = context.Model;

        // A cell requires at least one paragraph, so its sole empty paragraph is structural; only multiple entirely empty paragraphs are redundant.
        foreach (var cell in model.BodyElement.Descendants(W.Tc))
        {
            var paragraphs = cell.Elements(W.P).Select(item => model.Records.GetValueOrDefault(item)).Where(item => item is not null).Cast<ParaRecord>().ToList();
            if (paragraphs.Count < 2 || paragraphs.Any(item => !item.IsEmpty)) continue;
            foreach (var record in paragraphs.Skip(1))
            {
                yield return context.At(rule, record, "单元格内存在多余空段落",
                    $"该单元格有 {paragraphs.Count} 个空段落（需保留 1 个），多余的会造成额外空行", "删除多余空行，保留一个");
            }
        }

        // A paragraph must separate tables, and the final document paragraph cannot be deleted; do not report these empty paragraphs.
        var blocks = model.BodyBlocks;
        var required = new HashSet<XElement>(ReferenceEqualityComparer.Instance);
        for (var index = 0; index < blocks.Count; index += 1)
        {
            if (blocks[index].IsTable) continue;
            var previousTable = index > 0 && blocks[index - 1].IsTable;
            var nextTable = index + 1 < blocks.Count && blocks[index + 1].IsTable;
            if ((previousTable && nextTable) || index == blocks.Count - 1) required.Add(blocks[index].Element);
        }

        foreach (var record in context.Groups.Body)
        {
            if (!record.IsEmpty || record.HasSectionBreak || required.Contains(record.Element)) continue;
            if (record.HasPageBreak)
            {
                yield return context.At(rule, record, "存在含分页符的空段落",
                    "该空段落用分页符强制换页，会多占一行；要求每页固定行数时会不符",
                    "可删除本段，改为在下一段设置「段前分页」", severity: Severity.Low);
                continue;
            }

            // Deleting it directly would move subsequent content back a page; leave it during fixes and explain that the page break must move to the next paragraph.
            if (record.Format.PageBreakBefore)
            {
                yield return context.At(rule, record, "存在设置段前分页的空段落",
                    "该空段落靠「段前分页」让后文另起一页，会多占一行；要求每页固定行数时会不符",
                    "可删除本段，改为在下一段设置「段前分页」", severity: Severity.Low);
                continue;
            }

            yield return context.At(rule, record, "存在空段落",
                "空段落会造成多余空行，要求每页固定行数时会导致版面不符", "删除该空行");
        }
    }

    /// <summary>
    /// Report manually typed "Page X" in the body when page numbers are footer-only or forbidden.
    /// When footers permit only page numbers but contain no page-number field, give a low-risk warning (not per section, since contents sections often omit numbering).
    /// </summary>
    static IEnumerable<Finding> CheckPageNumberText(RuleContext context, RuleSpec rule)
    {
        var pageMode = context.Profile.Text("structure.page_number");
        if (pageMode is null) yield break;
        if (pageMode == "footer_only" && context.Profile.Bool("structure.check_header_footer", true)
            && !context.Model.FooterParts.Any(part => context.Model.Parts[part].Root is { } root && FieldScanner.Scan(root).Any(field => PageFields.Contains(field.Kind))))
        {
            yield return context.Global(rule, "页脚中没有页码", "页脚",
                "招标文件要求页脚出现页码，文档的页脚里没有页码域",
                "插入 → 页码 → 页面底端，按招标文件要求的格式插入页码", severity: Severity.Low);
        }

        foreach (var record in context.Groups.Body)
        {
            var text = record.Text.Trim();
            if (text.Length == 0 || !PageNumberText.IsMatch(text)) continue;
            yield return context.At(rule, record, "正文中出现页码文字", $"内容：{text}", "删除该行");
        }
    }

    static IEnumerable<Finding> CheckToc(RuleContext context, RuleSpec rule)
    {
        var mode = context.Profile.Text("structure.check_toc_present", "hint");
        if (mode == "ignore") yield break;
        var toc = context.Outline.Toc;
        // HasToc marks only contents fields/styles (also controlling heading recognition from entries); dot-leader or handwritten contents entries still count as a table of contents.
        var present = toc.HasToc || toc.Entries.Count > 0;
        if (present && mode == "forbid")
        {
            // A never-updated contents field displays nothing, but updating it in Word / WPS generates the contents.
            var detail = toc.Entries.Count > 0
                ? $"共 {toc.Entries.Count} 条目录条目，部分招标文件要求暗标不得有目录"
                : "文档中有一个尚未更新的空目录域，当前不显示内容，但更新域（F9）后会生成目录";
            yield return context.Global(rule, toc.Entries.Count > 0 ? "文档包含目录" : "文档包含空的目录域", "目录",
                detail, "确认招标文件要求；如不允许，删除目录或目录域（可在 Alt+F9 显示域代码后删除）");
        }
        else if (!present && mode == "require")
        {
            yield return context.Global(rule, "未检测到目录", "全文", "招标文件要求提供目录时需补充",
                "引用 → 目录 → 自动目录", severity: Severity.Low);
        }

        if (toc.Entries.Count > 0 && !toc.HasField)
        {
            yield return context.Global(rule, "目录疑似手工录入", "目录",
                "手工目录不会随正文标题自动更新，容易与实际标题不一致",
                "建议用「引用 → 目录」自动生成", severity: Severity.Low);
        }
    }

    /// <summary>Handwritten Arabic hierarchy numbers such as "1,", "1.1", or "1.1.1 ": group count gives depth; exclude numbers immediately followed by another digit, such as years.</summary>
    static readonly Regex ArabicNumber = new(@"^(\d{1,3})((?:[.．]\d{1,3})*)(?![\d.．]*\d)");

    /// <summary>Other handwritten numbering: chapter labels, Chinese numerals, parenthesized numerals, circled digits, letters, or Roman numerals.</summary>
    static readonly Regex OtherNumber = new(@"^(第\s*[一二三四五六七八九十百零〇\d]{1,4}\s*[章篇节部分条款]|[一二三四五六七八九十百零〇]{1,3}\s*[、.．]|[（(]\s*[一二三四五六七八九十百零〇\d]{1,3}\s*[)）]|[①-⑳]|[A-Za-z]\s*[、.．)）]|[IVXⅠ-Ⅻ]+\s*[、.．])");

    /// <summary>
    /// A heading's numbering. Kind: auto for automatic, arabic for handwritten Arabic, other for other handwritten numbering, and none for no numbering.
    /// Prefix is the original handwritten prefix; Depth is the Arabic numbering depth.
    /// </summary>
    public sealed record HeadingNumber(ParaRecord Record, int Level, bool Nominal, string Kind, string Prefix, int Depth, AutoNumber? Auto)
    {
        /// <summary>Unnumbered headings before the first numbered heading are document or volume titles and do not require numbering.</summary>
        public bool Title { get; init; }

        /// <summary>Non-Arabic formats used by automatic numbering; null when all are Arabic.</summary>
        public string? OtherFormat => Auto?.Formats.Prepend(Auto.Format).FirstOrDefault(format => format is not ("decimal" or "decimalZero"));

        /// <summary>Arabic numbering depth differs from heading level; skip comparison for nominal levels inferred from numbering styles.</summary>
        public bool DepthMismatch => Kind is "auto" or "arabic" && OtherFormat is null && !Nominal && Depth != Level;
    }

    /// <summary>Body heading numbers: use definitions for automatic numbering and leading prefixes for handwritten numbering. Shared by checks and fixes.</summary>
    public static List<HeadingNumber> HeadingNumbers(RuleContext context, NumberingFormats numbering)
    {
        var result = new List<HeadingNumber>();
        foreach (var record in context.Groups.Body)
        {
            if (record.IsEmpty || context.HeadingLevel(record) is not { } level) continue;
            var nominal = context.Outline.SourceOf(record.Element) == "pattern";
            var text = record.Text.TrimStart(' ', '　', '\t');
            if (numbering.Of(record) is { } auto) result.Add(new HeadingNumber(record, level, nominal, "auto", "", Math.Max(1, auto.Depth), auto));
            else if (ArabicNumber.Match(text) is { Success: true } match) result.Add(new HeadingNumber(record, level, nominal, "arabic", match.Value, 1 + match.Groups[2].Value.Count(ch => ch is '.' or '．'), null));
            else if (OtherNumber.Match(text) is { Success: true } other) result.Add(new HeadingNumber(record, level, nominal, "other", other.Value, 0, null));
            else result.Add(new HeadingNumber(record, level, nominal, "none", "", 0, null));
        }

        var first = result.FindIndex(item => item.Kind != "none");
        for (var index = 0; index < first; index += 1) result[index] = result[index] with { Title = true };
        return result;
    }

    static string NumberExample(int level) => string.Join(".", Enumerable.Repeat("1", Math.Max(1, level)));

    static string FormatName(string format) => format switch
    {
        "decimal" or "decimalZero" => "阿拉伯数字",
        "chineseCounting" or "chineseCountingThousand" or "chineseLegalSimplified" or "ideographTraditional" or "ideographDigital" or "ideographLegalTraditional" => "中文数字",
        "upperRoman" or "lowerRoman" => "罗马数字",
        "upperLetter" or "lowerLetter" => "字母",
        _ when format.StartsWith("decimalEnclosed", StringComparison.Ordinal) => "带圈或括号数字",
        _ => format,
    };

    /// <summary>
    /// Check when requirements demand hierarchical Arabic heading numbers (level 1: 1, level 2: 1.1, level 3: 1.1.1):
    /// inspect format and text depth for automatic numbering, and leading prefixes for handwritten numbering; do not compare nominal heading levels inferred from numbering styles.
    /// Unnumbered headings before the first numbered heading are document titles and are not reported.
    /// </summary>
    static IEnumerable<Finding> CheckHeadingNumberFormat(RuleContext context, RuleSpec rule)
    {
        if (context.Profile.Text("structure.heading_numbering") != "arabic") yield break;
        const string Hint = "把标题序号改为阿拉伯数字分级编号（一级 1、二级 1.1、三级 1.1.1）；如果是招标文件规定的分册或章节名称，可保留";
        foreach (var heading in HeadingNumbers(context, NumberingFormats.Load(context.Model)))
        {
            var (record, level) = (heading.Record, heading.Level);
            if (heading.OtherFormat is { } other)
            {
                yield return context.At(rule, record, "标题序号不是阿拉伯数字", $"自动编号为{FormatName(other)}（编号格式「{heading.Auto!.Text}」），要求 {level} 级标题为「{NumberExample(level)}」", Hint);
            }
            else if (heading.Kind == "other")
            {
                yield return context.At(rule, record, "标题序号不是阿拉伯数字", $"当前序号「{heading.Prefix.Trim()}」，要求 {level} 级标题为「{NumberExample(level)}」", Hint);
            }
            else if (heading.Kind == "none" && !heading.Title)
            {
                yield return context.At(rule, record, "标题没有序号", $"招标文件要求标题按阿拉伯数字分级编号，{level} 级标题应为「{NumberExample(level)}」", Hint, severity: Severity.Low);
            }
            else if (heading.DepthMismatch)
            {
                var current = heading.Kind == "auto" ? $"自动编号「{heading.Auto!.Text}」" : heading.Prefix;
                yield return context.At(rule, record, "标题序号级数与标题级别不符", $"当前「{current}」是 {heading.Depth} 级编号，本标题为 {level} 级，应为「{NumberExample(level)}」", Hint);
            }
        }
    }

    static IEnumerable<Finding> CheckTextbox(RuleContext context, RuleSpec rule)
    {
        if (!context.Profile.Bool("structure.check_textbox", true)) yield break;
        var count = DocumentModel.TextboxContents(context.Model.BodyElement).Count();
        if (count == 0) yield break;
        yield return context.Global(rule, "文档中存在文本框", "正文",
            $"共 {count} 个文本框。文本框内容不受正文格式约束，常被用来放图注或说明，容易被判为格式不一致",
            "确认是否必要，必要时把文本框内容转为正文");
    }

    /// <summary>
    /// User-inserted bookmarks: report identifying information such as sensitive terms in names as high risk; list other names for manual confirmation.
    /// Ignore Word-generated hidden bookmarks whose names start with underscores (_Toc, _GoBack, _Ref, etc.).
    /// </summary>
    static IEnumerable<Finding> CheckBookmarks(RuleContext context, RuleSpec rule)
    {
        if (!context.Profile.Bool("structure.check_bookmarks", false)) yield break;
        var names = new List<string>();
        foreach (var bookmark in context.Model.BodyElement.Descendants(W.Ns + "bookmarkStart"))
        {
            var name = W.Attr(bookmark, "name");
            if (string.IsNullOrWhiteSpace(name) || name.StartsWith('_') || names.Contains(name)) continue;
            names.Add(name);
            var hits = PrivacyRules.IdentityHits(context, name);
            if (hits.Count == 0) continue;
            var paragraph = bookmark.AncestorsAndSelf(W.P).FirstOrDefault() ?? bookmark.ElementsAfterSelf(W.P).FirstOrDefault();
            var detail = $"书签「{name}」{hits[0].Message}，书签名称可在「插入 → 书签」中看到";
            const string Hint = "插入 → 书签，删除或重命名该书签";
            yield return paragraph is not null && context.Model.Records.TryGetValue(paragraph, out var record)
                ? context.At(rule, record, "书签名称含有身份信息", detail, Hint, severity: Severity.High)
                : context.Global(rule, "书签名称含有身份信息", "书签", detail, Hint, name, Severity.High);
        }

        if (names.Count == 0) yield break;
        yield return context.Global(rule, "文档含命名书签", "书签",
            $"共 {names.Count} 个：{RuleContext.Truncate(string.Join("、", names), 120)}。请确认书签名称没有单位或个人信息",
            "插入 → 书签，删除无关书签", RuleContext.Truncate(string.Join("、", names), 60));
    }

    static IEnumerable<Finding> CheckHyperlinks(RuleContext context, RuleSpec rule)
    {
        if (!context.Profile.Bool("structure.check_hyperlink", true)) yield break;
        foreach (var (part, document) in context.Model.Parts)
        {
            var root = document.Root;
            if (root is null) continue;
            var relationships = context.Model.Package.Relationships(part).ToDictionary(item => item.Id, StringComparer.Ordinal);
            var seen = new HashSet<string>(StringComparer.Ordinal);
            foreach (var link in root.Descendants(W.Hyperlink))
            {
                var id = link.Attribute(W.RId)?.Value;
                if (id is null || !seen.Add(id) || !relationships.TryGetValue(id, out var relationship)) continue;
                if (!relationship.External && !IsExternalTarget(relationship.Target)) continue;
                yield return HyperlinkFinding(context, rule, part, link, relationship.Target);
            }

            foreach (var field in FieldScanner.Scan(root).Where(item => item.Kind == "hyperlink"))
            {
                var target = QuotedTarget.Match(field.Instruction) is { Success: true } match ? match.Groups[1].Value : field.Instruction.Trim();
                if (!IsExternalTarget(target) || !seen.Add("field:" + target)) continue;
                yield return HyperlinkFinding(context, rule, part, field.Begin, target);
            }
        }
    }

    public static bool IsExternalTarget(string target)
    {
        return target.StartsWith("http", StringComparison.OrdinalIgnoreCase)
            || target.StartsWith("mailto", StringComparison.OrdinalIgnoreCase)
            || target.StartsWith("ftp", StringComparison.OrdinalIgnoreCase)
            || target.StartsWith("www.", StringComparison.OrdinalIgnoreCase);
    }

    static Finding HyperlinkFinding(RuleContext context, RuleSpec rule, string part, XElement? element, string target)
    {
        var paragraph = element?.AncestorsAndSelf(W.P).FirstOrDefault();
        var record = paragraph is null ? null : context.Model.Records.GetValueOrDefault(paragraph);
        var detail = $"链接目标：{RuleContext.Truncate(target, 120)}。超链接可能指向企业官网或邮箱，是身份泄露的典型途径";
        const string hint = "选中链接 → 右键 → 取消超链接";
        return record is null
            ? context.Global(rule, "存在外部超链接", context.PartLabel(part), detail, hint, RuleContext.Truncate(target, 60))
            : context.At(rule, record, "存在外部超链接", detail, hint);
    }

    static IEnumerable<Finding> CheckFields(RuleContext context, RuleSpec rule)
    {
        if (!context.Profile.Bool("structure.check_field_codes", true)) yield break;
        foreach (var (part, document) in context.Model.Parts)
        {
            if (document.Root is null) continue;
            var hits = FieldScanner.Scan(document.Root)
                .Where(field => SuspectFields.Contains(field.Kind))
                .GroupBy(field => field.Kind.ToUpperInvariant())
                .Select(group => $"{group.Key}（{group.Count()}）")
                .ToList();
            if (hits.Count == 0) continue;
            yield return context.Global(rule, "存在可能泄露身份的域代码", context.PartLabel(part),
                $"发现域：{string.Join("、", hits)}。这类域更新时会插入作者、文件名、公司等信息",
                "按 Alt+F9 显示域代码，删除这些域，或选中后按 Ctrl+Shift+F9 转为普通文字");
        }
    }

    static IEnumerable<Finding> CheckDocumentProperties(RuleContext context, RuleSpec rule)
    {
        var package = context.Model.Package;
        const string hint = "文件 → 信息 → 检查问题 → 检查文档，删除「文档属性和个人信息」";
        var core = package.TryLoad(package.RelatedPart("", "/core-properties", "docProps/core.xml") ?? "")?.Root;
        var app = package.TryLoad(package.RelatedPart("", "/extended-properties", "docProps/app.xml") ?? "")?.Root;
        var custom = package.TryLoad(package.RelatedPart("", "/custom-properties", "docProps/custom.xml") ?? "")?.Root;

        var checks = new (string Name, string Label, string Switch)[]
        {
            ("creator", "作者", "props.check_author"),
            ("lastModifiedBy", "最后修改者", "props.check_last_modified_by"),
        };
        foreach (var (name, label, toggle) in checks)
        {
            var value = LocalChild(core, name)?.Value.Trim();
            if (string.IsNullOrEmpty(value) || !context.Profile.Bool(toggle, true)) continue;
            yield return context.Global(rule, $"文档属性中残留「{label}」", "文档属性",
                $"{label}：{value}。文档属性随文件一起提交，评审方可直接读取", hint, value);
        }

        var company = LocalChild(app, "Company")?.Value.Trim();
        if (!string.IsNullOrEmpty(company) && context.Profile.Bool("props.check_company", true))
        {
            yield return context.Global(rule, "文档属性中残留「单位」", "文档属性", $"单位：{company}", hint, company);
        }

        var template = LocalChild(app, "Template")?.Value.Trim();
        if (!string.IsNullOrEmpty(template) && !DefaultTemplates.Contains(template) && context.Profile.Bool("props.check_template", true))
        {
            yield return context.Global(rule, "文档属性中残留模板名称", "文档属性",
                $"模板：{template}。模板名可能包含单位或项目名称", hint, template, Severity.Low);
        }

        if (custom is not null && context.Profile.Bool("props.check_custom_props", true))
        {
            var names = custom.Elements()
                .Select(item => item.Attribute("name")?.Value)
                .Where(item => !string.IsNullOrWhiteSpace(item) && !BenignCustomProperties.Contains(item!))
                .Cast<string>()
                .ToList();
            if (names.Count > 0)
            {
                yield return context.Global(rule, "文档含自定义属性", "文档属性",
                    $"共 {names.Count} 项：{RuleContext.Truncate(string.Join("、", names), 120)}。请确认其中没有单位或个人信息",
                    "文件 → 信息 → 属性 → 高级属性 → 自定义，删除无关属性", "", Severity.Low);
            }
        }
    }

    public static XElement? LocalChild(XElement? parent, string localName)
    {
        return parent?.Elements().FirstOrDefault(item => item.Name.LocalName == localName);
    }
}
