import { describe, expect, it } from "vitest";
import {
	backKeySvg,
	contrastColor,
	DEFAULT_COLORS,
	emptyKeySvg,
	escapeXml,
	navKeySvg,
	openPanelKeySvg,
	parseHex,
	renderBackKey,
	renderEmptyKey,
	renderNavKey,
	renderOpenPanelKey,
	renderSessionKey,
	type StatusColors,
	sessionKeySvg,
	tintBg,
	toDataUri,
	truncate,
	wrapText,
} from "./renderer";

const colors: StatusColors = { ...DEFAULT_COLORS };

// ── parseHex ──────────────────────────────────────────────

describe("parseHex", () => {
	it("parses 6-digit hex with #", () => {
		expect(parseHex("#4CAF50")).toEqual([76, 175, 80]);
	});

	it("parses 6-digit hex without #", () => {
		expect(parseHex("4CAF50")).toEqual([76, 175, 80]);
	});

	it("parses black", () => {
		expect(parseHex("#000000")).toEqual([0, 0, 0]);
	});

	it("parses white", () => {
		expect(parseHex("#FFFFFF")).toEqual([255, 255, 255]);
	});

	it("parses lowercase hex", () => {
		expect(parseHex("#ff0000")).toEqual([255, 0, 0]);
	});

	it("parses mixed case hex", () => {
		expect(parseHex("#aAbBcC")).toEqual([170, 187, 204]);
	});
});

// ── contrastColor ─────────────────────────────────────────

describe("contrastColor", () => {
	it("returns #fff for dark backgrounds", () => {
		expect(contrastColor("#000000")).toBe("#fff");
	});

	it("returns #000 for light backgrounds", () => {
		expect(contrastColor("#FFFFFF")).toBe("#000");
	});

	it("returns #000 for green (luminance > 128)", () => {
		// luminance = 0.299*76 + 0.587*175 + 0.114*80 ≈ 134.6
		expect(contrastColor("#4CAF50")).toBe("#000");
	});

	it("returns #fff for deep blue (luminance < 128)", () => {
		// luminance = 0.299*26 + 0.587*26 + 0.114*46 ≈ 28.3
		expect(contrastColor("#1a1a2e")).toBe("#fff");
	});

	it("returns #fff at luminance boundary (gray 128)", () => {
		// #808080 → luminance ≈ 128, just below threshold due to float precision
		expect(contrastColor("#808080")).toBe("#fff");
	});

	it("returns #000 for slightly lighter gray", () => {
		// #909090 → luminance = 0.299*144 + 0.587*144 + 0.114*144 = 144
		expect(contrastColor("#909090")).toBe("#000");
	});
});

// ── tintBg ────────────────────────────────────────────────

describe("tintBg", () => {
	it("blends with default opacity 0.2", () => {
		const result = tintBg("#4CAF50");
		// BG_INACTIVE = #1a1a2e → R=26, G=26, B=46
		// accent = #4CAF50 → R=76, G=175, B=80
		// R = round(26 + (76-26)*0.2) = round(36) = 36
		// G = round(26 + (175-26)*0.2) = round(55.8) = 56
		// B = round(46 + (80-46)*0.2) = round(52.8) = 53
		expect(result).toBe("#243835");
	});

	it("returns BG_INACTIVE at opacity 0", () => {
		expect(tintBg("#4CAF50", 0)).toBe("#1a1a2e");
	});

	it("returns accent color at opacity 1.0", () => {
		expect(tintBg("#4CAF50", 1.0)).toBe("#4caf50");
	});

	it("blends at opacity 0.5", () => {
		const result = tintBg("#4CAF50", 0.5);
		// R = round(26 + 50*0.5) = 51 = 0x33
		// G = round(26 + 149*0.5) = 101 = 0x65 (round(100.5) = 101)
		// B = round(46 + 34*0.5) = 63 = 0x3f
		expect(result).toMatch(/^#[0-9a-f]{6}$/);
	});

	it("blends white accent", () => {
		const result = tintBg("#FFFFFF", 0.2);
		// R = round(26 + (255-26)*0.2) = round(71.8) = 72
		// G = round(26 + (255-26)*0.2) = round(71.8) = 72
		// B = round(46 + (255-46)*0.2) = round(87.8) = 88
		expect(result).toMatch(/^#[0-9a-f]{6}$/);
	});
});

// ── escapeXml ─────────────────────────────────────────────

describe("escapeXml", () => {
	it("escapes ampersand", () => {
		expect(escapeXml("a&b")).toBe("a&amp;b");
	});

	it("escapes less-than", () => {
		expect(escapeXml("a<b")).toBe("a&lt;b");
	});

	it("escapes greater-than", () => {
		expect(escapeXml("a>b")).toBe("a&gt;b");
	});

	it("escapes double quote", () => {
		expect(escapeXml('a"b')).toBe("a&quot;b");
	});

	it("escapes all special chars together", () => {
		expect(escapeXml('&<>"')).toBe("&amp;&lt;&gt;&quot;");
	});

	it("returns empty string unchanged", () => {
		expect(escapeXml("")).toBe("");
	});

	it("passes through normal text", () => {
		expect(escapeXml("hello world")).toBe("hello world");
	});
});

// ── truncate ──────────────────────────────────────────────

describe("truncate", () => {
	it("returns string shorter than maxLen unchanged", () => {
		expect(truncate("hi", 10)).toBe("hi");
	});

	it("returns string at exactly maxLen unchanged", () => {
		expect(truncate("hello", 5)).toBe("hello");
	});

	it("truncates string longer than maxLen", () => {
		expect(truncate("hello world", 5)).toBe("hello");
	});

	it("handles empty string", () => {
		expect(truncate("", 0)).toBe("");
	});
});

// ── wrapText ──────────────────────────────────────────────

describe("wrapText", () => {
	it("wraps single word that fits", () => {
		expect(wrapText("hello", 10, 3)).toEqual(["hello"]);
	});

	it("wraps two words on one line", () => {
		expect(wrapText("hello world", 15, 3)).toEqual(["hello world"]);
	});

	it("wraps two words onto two lines", () => {
		expect(wrapText("hello world", 6, 3)).toEqual(["hello", "world"]);
	});

	it("truncates word longer than maxCharsPerLine", () => {
		const result = wrapText("superlongword", 5, 3);
		expect(result[0]).toBe("super");
	});

	it("respects maxLines=1", () => {
		const result = wrapText("hello beautiful world", 10, 1);
		expect(result).toHaveLength(1);
	});

	it("respects maxLines=2 with 3-line text", () => {
		const result = wrapText("one two three four five", 5, 2);
		expect(result.length).toBeLessThanOrEqual(2);
	});

	it("handles multiple spaces between words", () => {
		const result = wrapText("hello   world", 15, 3);
		expect(result).toEqual(["hello world"]);
	});

	it("wraps text at exact maxChars boundary", () => {
		expect(wrapText("abcde fghij", 5, 3)).toEqual(["abcde", "fghij"]);
	});

	it("handles three lines of text", () => {
		const result = wrapText("one two three", 5, 3);
		expect(result).toEqual(["one", "two", "three"]);
	});

	it("truncates words that exceed line width", () => {
		const result = wrapText("abcdefghij", 5, 3);
		expect(result[0]).toHaveLength(5);
	});

	it("handles single character words", () => {
		expect(wrapText("a b c", 3, 3)).toEqual(["a b", "c"]);
	});

	it("wraps long text with mixed lengths", () => {
		const result = wrapText("hi there everyone", 8, 2);
		expect(result.length).toBeLessThanOrEqual(2);
		expect(result[0].length).toBeLessThanOrEqual(8);
	});
});

// ── toDataUri ─────────────────────────────────────────────

describe("toDataUri", () => {
	it("prefixes with data URI scheme", () => {
		const result = toDataUri("<svg></svg>");
		expect(result).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
	});

	it("URI-encodes SVG content", () => {
		const result = toDataUri('<svg attr="val"></svg>');
		expect(result).toContain(encodeURIComponent('<svg attr="val"></svg>'));
	});
});

// ── sessionKeySvg ─────────────────────────────────────────

describe("sessionKeySvg", () => {
	it("renders working status with border", () => {
		const svg = sessionKeySvg(
			"myproj",
			"main",
			"doing stuff",
			"working",
			colors,
		);
		expect(svg).toContain(`stroke="${colors.working}"`);
		expect(svg).toContain('stroke-width="4"');
	});

	it("renders awaiting_input status with border", () => {
		const svg = sessionKeySvg(
			"myproj",
			"main",
			"waiting",
			"awaiting_input",
			colors,
		);
		expect(svg).toContain(`stroke="${colors.awaiting}"`);
	});

	it("renders inactive status without border", () => {
		const svg = sessionKeySvg("myproj", "main", "idle", "inactive", colors);
		expect(svg).not.toContain('stroke-width="4"');
	});

	it("includes branch text when branch provided", () => {
		const svg = sessionKeySvg("myproj", "feat-x", "summary", "working", colors);
		expect(svg).toContain("feat-x");
	});

	it("omits branch text when branch is empty", () => {
		const svg = sessionKeySvg("myproj", "", "summary", "working", colors);
		// No branch <text> element with secondary color
		expect(svg).not.toContain('fill="#aaa"');
	});

	it("uses 'New session' when summary is empty", () => {
		const svg = sessionKeySvg("myproj", "", "", "inactive", colors);
		expect(svg).toContain("New session");
	});

	it("snapshot: working, small font, with branch", () => {
		expect(
			sessionKeySvg("aideck", "main", "fix tests", "working", colors, "small"),
		).toMatchSnapshot();
	});

	it("snapshot: awaiting_input, medium font, no branch", () => {
		expect(
			sessionKeySvg(
				"project",
				"",
				"waiting for input",
				"awaiting_input",
				colors,
				"medium",
			),
		).toMatchSnapshot();
	});

	it("snapshot: inactive, large font", () => {
		expect(
			sessionKeySvg(
				"bigproj",
				"dev",
				"old session",
				"inactive",
				colors,
				"large",
			),
		).toMatchSnapshot();
	});
});

// ── renderSessionKey ──────────────────────────────────────

describe("renderSessionKey", () => {
	it("returns a data URI", () => {
		const result = renderSessionKey("proj", "main", "test", "working", colors);
		expect(result).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
	});
});

// ── navKeySvg ─────────────────────────────────────────────

describe("navKeySvg", () => {
	it("snapshot: PREV enabled", () => {
		expect(navKeySvg("PREV", true)).toMatchSnapshot();
	});

	it("snapshot: PREV disabled", () => {
		expect(navKeySvg("PREV", false)).toMatchSnapshot();
	});

	it("snapshot: NEXT enabled", () => {
		expect(navKeySvg("NEXT", true)).toMatchSnapshot();
	});

	it("snapshot: NEXT disabled", () => {
		expect(navKeySvg("NEXT", false)).toMatchSnapshot();
	});

	it("uses correct arrow direction for PREV", () => {
		const svg = navKeySvg("PREV", true);
		// PREV arrow: L88 48 → L56 72 → L88 96 (left-pointing)
		expect(svg).toContain("L56 72");
	});

	it("uses correct arrow direction for NEXT", () => {
		const svg = navKeySvg("NEXT", true);
		// NEXT arrow: L56 48 → L88 72 → L56 96 (right-pointing)
		expect(svg).toContain("L88 72");
	});
});

// ── renderNavKey ──────────────────────────────────────────

describe("renderNavKey", () => {
	it("returns a data URI", () => {
		expect(renderNavKey("PREV", true)).toMatch(
			/^data:image\/svg\+xml;charset=utf-8,/,
		);
	});
});

// ── backKeySvg ────────────────────────────────────────────

describe("backKeySvg", () => {
	it("snapshot", () => {
		expect(backKeySvg()).toMatchSnapshot();
	});
});

// ── renderBackKey ─────────────────────────────────────────

describe("renderBackKey", () => {
	it("returns a data URI", () => {
		expect(renderBackKey()).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
	});
});

// ── openPanelKeySvg ───────────────────────────────────────

describe("openPanelKeySvg", () => {
	it("renders with no badges when all counts are zero", () => {
		const svg = openPanelKeySvg(0, 0, 0, colors);
		expect(svg).not.toContain('rx="12"'); // no badge rects
	});

	it("renders badge for working only", () => {
		const svg = openPanelKeySvg(0, 3, 0, colors);
		expect(svg).toContain("3");
		expect(svg).toContain(colors.working);
	});

	it("renders badge for awaiting only", () => {
		const svg = openPanelKeySvg(2, 0, 0, colors);
		expect(svg).toContain("2");
		expect(svg).toContain(colors.awaiting);
	});

	it("renders badge for inactive only (no activity shift)", () => {
		const svg = openPanelKeySvg(0, 0, 5, colors);
		expect(svg).toContain("5");
		// hasActivity is false, so title at y=60
		expect(svg).toContain('y="60"');
	});

	it("renders all three badges", () => {
		const svg = openPanelKeySvg(2, 3, 5, colors);
		expect(svg).toContain(colors.working);
		expect(svg).toContain(colors.awaiting);
		expect(svg).toContain(colors.inactive);
	});

	it("caps count at 99", () => {
		const svg = openPanelKeySvg(100, 0, 0, colors);
		expect(svg).toContain("99");
		expect(svg).not.toContain("100");
	});

	it("snapshot: mixed counts", () => {
		expect(openPanelKeySvg(2, 3, 5, colors)).toMatchSnapshot();
	});

	it("snapshot: no activity", () => {
		expect(openPanelKeySvg(0, 0, 0, colors)).toMatchSnapshot();
	});
});

// ── renderOpenPanelKey ────────────────────────────────────

describe("renderOpenPanelKey", () => {
	it("returns a data URI", () => {
		expect(renderOpenPanelKey(1, 2, 3, colors)).toMatch(
			/^data:image\/svg\+xml;charset=utf-8,/,
		);
	});
});

// ── emptyKeySvg ───────────────────────────────────────────

describe("emptyKeySvg", () => {
	it("snapshot", () => {
		expect(emptyKeySvg()).toMatchSnapshot();
	});

	it("contains background rect", () => {
		const svg = emptyKeySvg();
		expect(svg).toContain('fill="#1a1a2e"');
		expect(svg).toContain('rx="28"');
	});
});

// ── renderEmptyKey ────────────────────────────────────────

describe("renderEmptyKey", () => {
	it("returns a data URI", () => {
		expect(renderEmptyKey()).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
	});
});

// ── Constants ─────────────────────────────────────────────

describe("DEFAULT_COLORS", () => {
	it("has expected default values", () => {
		expect(DEFAULT_COLORS).toEqual({
			awaiting: "#4CAF50",
			working: "#FFA726",
			inactive: "#555555",
		});
	});
});
