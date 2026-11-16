using System.Text.Json;

namespace Savia.OpenXmlHelper.Jobs;

/// <summary>Complete header/footer text region in cm, relative to the paper's top-left corner.</summary>
sealed record ChromeTextBox(double StartCm, double EndCm, double TopCm, double HeightCm);

/// <summary>Header text-layer description.</summary>
sealed class ChromeHeaderText
{
    public string Color { get; init; } = "";
    public bool Bold { get; init; }
    public string Align { get; init; } = "";
    public ChromeTextBox? Box { get; init; }
    /// <summary>Text in the band style's left badge block; null for other styles.</summary>
    public ChromeHeaderText? Badge { get; init; }
}

/// <summary>Footer text-layer description. Page-number backgrounds use run shading and automatically fit the text width.</summary>
sealed class ChromeFooterText
{
    public string Color { get; init; } = "";
    public string Align { get; init; } = "";
    public ChromeTextBox? Box { get; init; }
    public string PageNumberColor { get; init; } = "";
    /// <summary>Empty means page numbers have no shading.</summary>
    public string PageNumberShading { get; init; } = "";
    public bool PageNumberBold { get; init; }
    public string PageNumberAlign { get; init; } = "";
    public ChromeTextBox? PageNumberBox { get; init; }
}

/// <summary>
/// Header/footer decorations received from the renderer. Decorations are PNG images rasterized from SVG;
/// Word native runs still carry text and page numbers, positioned by these text-layer descriptions.
/// </summary>
sealed class ChromeAssets
{
    public static readonly ChromeAssets Empty = new();

    public string HeaderImagePath { get; private set; } = "";
    public string FooterImagePath { get; private set; } = "";
    public double HeaderHeightCm { get; private set; }
    public double FooterHeightCm { get; private set; }
    public double FooterTopCm { get; private set; }
    public double FooterDistanceCm { get; private set; }
    /// <summary>Header paragraph distance from the page top: 0 with decorations (floating text boxes position text), or Word's default 1.25 cm for plain style.</summary>
    public double HeaderDistanceCm { get; private set; }
    public double MarginTopCm { get; private set; }
    public double MarginBottomCm { get; private set; }
    public ChromeHeaderText? HeaderText { get; private set; }
    public ChromeFooterText? FooterText { get; private set; }

    public bool HasHeaderImage => HeaderImagePath.Length > 0 && File.Exists(HeaderImagePath);
    public bool HasFooterImage => FooterImagePath.Length > 0 && File.Exists(FooterImagePath);
    /// <summary>Whether the caller supplied geometry; otherwise retain configured margins.</summary>
    public bool HasLayout => MarginTopCm > 0 || MarginBottomCm > 0;

    static string Text(JsonElement parent, string name, string fallback = "")
        => parent.ValueKind == JsonValueKind.Object
            && parent.TryGetProperty(name, out var value)
            && value.ValueKind == JsonValueKind.String
                ? value.GetString() ?? fallback
                : fallback;

    static double Number(JsonElement parent, string name, double fallback = 0)
        => parent.ValueKind == JsonValueKind.Object
            && parent.TryGetProperty(name, out var value)
            && value.ValueKind == JsonValueKind.Number
                ? value.GetDouble()
                : fallback;

    static bool Bool(JsonElement parent, string name)
        => parent.ValueKind == JsonValueKind.Object
            && parent.TryGetProperty(name, out var value)
            && value.ValueKind == JsonValueKind.True;

    static JsonElement Child(JsonElement parent, string name)
        => parent.ValueKind == JsonValueKind.Object && parent.TryGetProperty(name, out var value)
            ? value
            : default;

    /// <summary>Read text regions from the shared layout; null means ordinary paragraphs.</summary>
    static ChromeTextBox? TextBox(JsonElement parent)
    {
        var box = Child(parent, "box");
        return box.ValueKind == JsonValueKind.Object
            ? new ChromeTextBox(Number(box, "startCm"), Number(box, "endCm"), Number(box, "topCm"), Number(box, "heightCm"))
            : null;
    }

    /// <summary>Parse chrome_assets from the request; return Empty if missing or invalid so callers fall back to no decorations.</summary>
    public static ChromeAssets From(string workspace, JsonElement element)
    {
        if (element.ValueKind != JsonValueKind.Object) return Empty;

        var root = Text(element, "root");
        var assets = new ChromeAssets
        {
            HeaderHeightCm = Number(element, "header_height_cm"),
            FooterHeightCm = Number(element, "footer_height_cm"),
            FooterTopCm = Number(element, "footer_top_cm"),
            FooterDistanceCm = Number(element, "footer_distance_cm"),
            HeaderDistanceCm = Number(element, "header_distance_cm", 1.25),
            MarginTopCm = Number(element, "margin_top_cm"),
            MarginBottomCm = Number(element, "margin_bottom_cm"),
        };

        if (root.Length > 0)
        {
            var dir = WordWorkspace.ResolveWorkspacePath(workspace, root);
            assets.HeaderImagePath = ResolveImage(dir, Text(element, "header"));
            assets.FooterImagePath = ResolveImage(dir, Text(element, "footer"));
        }

        var layout = Child(element, "text_layout");
        var header = Child(layout, "header");
        if (header.ValueKind == JsonValueKind.Object)
        {
            var badge = Child(header, "badge");
            assets.HeaderText = new ChromeHeaderText
            {
                Color = Text(header, "color"),
                Bold = Bool(header, "bold"),
                Align = Text(header, "align"),
                Box = TextBox(header),
                Badge = badge.ValueKind == JsonValueKind.Object
                    ? new ChromeHeaderText
                    {
                        Color = Text(badge, "color"),
                        Bold = Bool(badge, "bold"),
                        Align = Text(badge, "align"),
                        Box = TextBox(badge),
                    }
                    : null,
            };
        }

        var footer = Child(layout, "footer");
        if (footer.ValueKind == JsonValueKind.Object)
        {
            var pageNumber = Child(footer, "pageNumber");
            assets.FooterText = new ChromeFooterText
            {
                Color = Text(footer, "color"),
                Align = Text(footer, "align"),
                Box = TextBox(footer),
                PageNumberColor = Text(pageNumber, "color"),
                PageNumberShading = Text(pageNumber, "shadingFill"),
                PageNumberBold = Bool(pageNumber, "bold"),
                PageNumberAlign = Text(pageNumber, "align"),
                PageNumberBox = TextBox(pageNumber),
            };
        }

        return assets;
    }

    /// <summary>Decoration images must be plain filenames inside the directory; reject path traversal.</summary>
    static string ResolveImage(string directory, string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return "";
        if (!string.Equals(name, Path.GetFileName(name), StringComparison.Ordinal)) return "";
        var full = Path.Combine(directory, name);
        return File.Exists(full) ? full : "";
    }
}
