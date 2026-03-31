import type { SessionStatus } from "./sessions";

const SIZE = 144;
const FONT = "Helvetica Neue, Helvetica, Arial, sans-serif";

const BG_INACTIVE = "#1a1a2e";
const BG_NAV = "#16213e";

const TEXT_PRIMARY = "#eee";
const TEXT_SECONDARY = "#aaa";
const TEXT_DIM = "#555";
const ACCENT = "#e94560";

export const DEFAULT_COLORS = {
	awaiting: "#4CAF50",
	working: "#FFA726",
	inactive: "#555555",
};

export interface StatusColors {
	awaiting: string;
	working: string;
	inactive: string;
}

export function parseHex(hex: string): [number, number, number] {
	const h = hex.replace("#", "");
	return [
		parseInt(h.slice(0, 2), 16),
		parseInt(h.slice(2, 4), 16),
		parseInt(h.slice(4, 6), 16),
	];
}

export function contrastColor(hex: string): string {
	const [r, g, b] = parseHex(hex);
	const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
	return luminance < 128 ? "#fff" : "#000";
}

export function tintBg(accentHex: string, opacity = 0.2): string {
	const [ar, ag, ab] = parseHex(accentHex);
	const [br, bg, bb] = parseHex(BG_INACTIVE);
	const r = Math.round(br + (ar - br) * opacity);
	const g = Math.round(bg + (ag - bg) * opacity);
	const b = Math.round(bb + (ab - bb) * opacity);
	return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export function escapeXml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

export function truncate(str: string, maxLen: number): string {
	if (str.length <= maxLen) return str;
	return str.slice(0, maxLen);
}

export function wrapText(
	text: string,
	maxCharsPerLine: number,
	maxLines: number,
): string[] {
	const words = text.split(/\s+/);
	const lines: string[] = [];
	let current = "";

	for (const word of words) {
		if (lines.length >= maxLines) break;
		const candidate = current ? `${current} ${word}` : word;
		if (candidate.length > maxCharsPerLine && current) {
			lines.push(current);
			current =
				word.length > maxCharsPerLine ? truncate(word, maxCharsPerLine) : word;
		} else if (candidate.length > maxCharsPerLine) {
			lines.push(truncate(candidate, maxCharsPerLine));
			current = "";
		} else {
			current = candidate;
		}
	}

	if (current && lines.length < maxLines) {
		lines.push(current);
	}

	if (lines.length === maxLines && current && !lines.includes(current)) {
		lines[maxLines - 1] = truncate(lines[maxLines - 1], maxCharsPerLine);
	}

	return lines;
}

export function toDataUri(svg: string): string {
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export type FontSize = "small" | "medium" | "large";

interface FontLayout {
	projectSize: number;
	projectChars: number;
	branchSize: number;
	branchChars: number;
	summarySize: number;
	summaryChars: number;
	summaryLines: number;
	// Y positions: [withBranch, withoutBranch]
	projectY: number;
	branchY: number;
	summaryY: [number, number];
	summaryLineHeight: number;
}

const FONT_LAYOUT: Record<FontSize, FontLayout> = {
	small: {
		projectSize: 20,
		projectChars: 14,
		branchSize: 16,
		branchChars: 16,
		summarySize: 17,
		summaryChars: 15,
		summaryLines: 3,
		projectY: 30,
		branchY: 56,
		summaryY: [80, 60],
		summaryLineHeight: 22,
	},
	medium: {
		projectSize: 24,
		projectChars: 12,
		branchSize: 19,
		branchChars: 14,
		summarySize: 21,
		summaryChars: 12,
		summaryLines: 2,
		projectY: 34,
		branchY: 64,
		summaryY: [92, 68],
		summaryLineHeight: 26,
	},
	large: {
		projectSize: 30,
		projectChars: 10,
		branchSize: 22,
		branchChars: 12,
		summarySize: 26,
		summaryChars: 10,
		summaryLines: 1,
		projectY: 40,
		branchY: 74,
		summaryY: [108, 80],
		summaryLineHeight: 30,
	},
};

export function sessionKeySvg(
	projectName: string,
	branch: string,
	summary: string,
	status: SessionStatus,
	colors: StatusColors,
	fontSize: FontSize = "small",
): string {
	let bg: string;
	let statusBar = "";
	if (status === "working") {
		bg = tintBg(colors.working);
		statusBar = `<rect x="0" y="0" width="${SIZE}" height="${SIZE}" rx="28" stroke="${colors.working}" stroke-width="4" fill="none"/>`;
	} else if (status === "awaiting_input") {
		bg = tintBg(colors.awaiting);
		statusBar = `<rect x="0" y="0" width="${SIZE}" height="${SIZE}" rx="28" stroke="${colors.awaiting}" stroke-width="4" fill="none"/>`;
	} else {
		bg = BG_INACTIVE;
	}

	const fl = FONT_LAYOUT[fontSize];
	const displayProject = escapeXml(truncate(projectName, fl.projectChars));
	const displayBranch = branch
		? escapeXml(truncate(branch, fl.branchChars))
		: "";
	const summaryText = summary || "New session";
	const summaryLines = wrapText(summaryText, fl.summaryChars, fl.summaryLines);

	const branchLine = displayBranch
		? `<text x="16" y="${fl.branchY}" fill="${TEXT_SECONDARY}" font-size="${fl.branchSize}" font-weight="500" font-family="${FONT}">${displayBranch}</text>`
		: "";

	const summaryStartY = displayBranch ? fl.summaryY[0] : fl.summaryY[1];
	const summaryTexts = summaryLines
		.map(
			(line, i) =>
				`<text x="16" y="${summaryStartY + i * fl.summaryLineHeight}" fill="${TEXT_PRIMARY}" font-size="${fl.summarySize}" font-family="${FONT}">${escapeXml(line)}</text>`,
		)
		.join("\n  ");

	return `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="fade" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0.82" stop-color="white"/>
      <stop offset="1" stop-color="black"/>
    </linearGradient>
    <mask id="m"><rect width="${SIZE}" height="${SIZE}" rx="28" fill="url(#fade)"/></mask>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" rx="28" fill="${bg}"/>
  ${statusBar}
  <g mask="url(#m)">
  <text x="16" y="${fl.projectY}" fill="${TEXT_PRIMARY}" font-size="${fl.projectSize}" font-weight="700" font-family="${FONT}">${displayProject}</text>
  ${branchLine}
  ${summaryTexts}
  </g>
</svg>`;
}

export function renderSessionKey(
	projectName: string,
	branch: string,
	summary: string,
	status: SessionStatus,
	colors: StatusColors,
	fontSize: FontSize = "small",
): string {
	return toDataUri(
		sessionKeySvg(projectName, branch, summary, status, colors, fontSize),
	);
}

export function navKeySvg(label: string, enabled: boolean): string {
	const color = enabled ? TEXT_PRIMARY : TEXT_DIM;
	const bg = enabled ? BG_NAV : BG_INACTIVE;

	let icon = "";
	if (label === "PREV") {
		icon = `<path d="M88 48 L56 72 L88 96" stroke="${color}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
	} else {
		icon = `<path d="M56 48 L88 72 L56 96" stroke="${color}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
	}

	return `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${SIZE}" height="${SIZE}" rx="28" fill="${bg}"/>
  ${icon}
</svg>`;
}

export function renderNavKey(label: string, enabled: boolean): string {
	return toDataUri(navKeySvg(label, enabled));
}

export function backKeySvg(): string {
	return `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${SIZE}" height="${SIZE}" rx="28" fill="${BG_NAV}"/>
  <path d="M88 38 L52 72 L88 106" stroke="${TEXT_PRIMARY}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

export function renderBackKey(): string {
	return toDataUri(backKeySvg());
}

export function openPanelKeySvg(
	awaiting: number,
	working: number,
	inactive: number,
	colors: StatusColors,
): string {
	const hasActivity = awaiting > 0 || working > 0;

	function badge(cx: number, color: string, count: number): string {
		if (count === 0) return "";
		const label = count > 99 ? "99" : String(count);
		const textColor = contrastColor(color);
		return `
    <rect x="${cx - 18}" y="98" width="36" height="24" rx="12" fill="${color}"/>
    <text x="${cx}" y="115" text-anchor="middle" fill="${textColor}" font-size="15" font-weight="700" font-family="${FONT}">${label}</text>`;
	}

	const badges: string[] = [];
	const counts = [
		{ color: colors.working, count: working },
		{ color: colors.awaiting, count: awaiting },
		{ color: colors.inactive, count: inactive },
	].filter((b) => b.count > 0);

	const badgeWidth = 40;
	const totalWidth = counts.length * badgeWidth;
	const startX = 72 - totalWidth / 2 + badgeWidth / 2;

	for (let i = 0; i < counts.length; i++) {
		badges.push(
			badge(startX + i * badgeWidth, counts[i].color, counts[i].count),
		);
	}

	const titleY = hasActivity ? 55 : 60;
	const subtitleY = hasActivity ? 80 : 100;

	return `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${SIZE}" height="${SIZE}" rx="28" fill="${BG_INACTIVE}"/>
  <text x="72" y="${titleY}" text-anchor="middle" fill="${ACCENT}" font-size="40" font-family="${FONT}" font-weight="bold">AI</text>
  <text x="72" y="${subtitleY}" text-anchor="middle" fill="${TEXT_PRIMARY}" font-size="28" font-family="${FONT}">Deck</text>
  ${badges.join("")}
</svg>`;
}

export function renderOpenPanelKey(
	awaiting: number,
	working: number,
	inactive: number,
	colors: StatusColors,
): string {
	return toDataUri(openPanelKeySvg(awaiting, working, inactive, colors));
}

export function emptyKeySvg(): string {
	return `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${SIZE}" height="${SIZE}" rx="28" fill="${BG_INACTIVE}"/>
</svg>`;
}

export function renderEmptyKey(): string {
	return toDataUri(emptyKeySvg());
}
