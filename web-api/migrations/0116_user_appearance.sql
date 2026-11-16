ALTER TABLE "user" ADD COLUMN savia_color_theme TEXT NOT NULL DEFAULT 'neutral' CHECK (savia_color_theme IN ('neutral', 'blue', 'green', 'violet', 'rose'));
ALTER TABLE "user" ADD COLUMN savia_visual_style TEXT NOT NULL DEFAULT 'vega' CHECK (savia_visual_style IN ('vega', 'nova', 'maia', 'lyra', 'mira'));
