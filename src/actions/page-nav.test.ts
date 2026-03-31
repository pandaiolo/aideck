import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@elgato/streamdeck", () => ({
	default: {
		logger: { info: vi.fn(), error: vi.fn() },
		settings: {
			getGlobalSettings: vi.fn().mockResolvedValue({}),
			onDidReceiveGlobalSettings: vi.fn(),
		},
	},
	action: () => (target: unknown) => target,
	SingletonAction: class {},
}));

vi.mock("../session-manager", () => ({
	sessionManager: {
		start: vi.fn(),
		registerNav: vi.fn(),
		unregisterNav: vi.fn(),
		prevPage: vi.fn(),
		nextPage: vi.fn(),
		isSinglePanel: false,
		getSessionForNavSlot: vi.fn(),
		openSession: vi.fn(),
	},
}));

import { sessionManager } from "../session-manager";
import { PageNavAction } from "./page-nav";

function makeEvent(col: number, row = 2, actionId = "a1") {
	return {
		action: { id: actionId, setImage: vi.fn().mockResolvedValue(undefined) },
		payload: { coordinates: { column: col, row } },
	};
}

function makeEventNoCoords() {
	return {
		action: { id: "a1", setImage: vi.fn().mockResolvedValue(undefined) },
		payload: {},
	};
}

describe("PageNavAction", () => {
	let navAction: PageNavAction;

	beforeEach(() => {
		navAction = new PageNavAction();
		(sessionManager as unknown as { isSinglePanel: boolean }).isSinglePanel =
			false;
	});

	describe("onWillAppear (coordsToDirection mapping)", () => {
		it("col=3 registers as prev", async () => {
			await navAction.onWillAppear(makeEvent(3) as never);
			expect(sessionManager.registerNav).toHaveBeenCalledWith(
				expect.anything(),
				"prev",
			);
		});

		it("col=4 registers as next", async () => {
			await navAction.onWillAppear(makeEvent(4) as never);
			expect(sessionManager.registerNav).toHaveBeenCalledWith(
				expect.anything(),
				"next",
			);
		});

		it("calls start on sessionManager", async () => {
			await navAction.onWillAppear(makeEvent(3) as never);
			expect(sessionManager.start).toHaveBeenCalled();
		});

		it("does nothing without coordinates", async () => {
			await navAction.onWillAppear(makeEventNoCoords() as never);
			expect(sessionManager.registerNav).not.toHaveBeenCalled();
		});
	});

	describe("onWillDisappear", () => {
		it("unregisters prev direction", async () => {
			await navAction.onWillDisappear(makeEvent(3) as never);
			expect(sessionManager.unregisterNav).toHaveBeenCalledWith("prev");
		});

		it("unregisters next direction", async () => {
			await navAction.onWillDisappear(makeEvent(4) as never);
			expect(sessionManager.unregisterNav).toHaveBeenCalledWith("next");
		});

		it("does nothing without coordinates", async () => {
			await navAction.onWillDisappear(makeEventNoCoords() as never);
			expect(sessionManager.unregisterNav).not.toHaveBeenCalled();
		});
	});

	describe("onKeyDown (normal mode)", () => {
		it("calls prevPage for prev direction", async () => {
			await navAction.onKeyDown(makeEvent(3) as never);
			expect(sessionManager.prevPage).toHaveBeenCalled();
		});

		it("calls nextPage for next direction", async () => {
			await navAction.onKeyDown(makeEvent(4) as never);
			expect(sessionManager.nextPage).toHaveBeenCalled();
		});

		it("does nothing without coordinates", async () => {
			await navAction.onKeyDown(makeEventNoCoords() as never);
			expect(sessionManager.prevPage).not.toHaveBeenCalled();
			expect(sessionManager.nextPage).not.toHaveBeenCalled();
		});
	});

	describe("onKeyDown (single panel mode)", () => {
		beforeEach(() => {
			(sessionManager as unknown as { isSinglePanel: boolean }).isSinglePanel =
				true;
		});

		it("opens session when one exists at nav slot", async () => {
			const session = { sessionId: "s1" };
			vi.mocked(sessionManager.getSessionForNavSlot).mockReturnValue(
				session as never,
			);
			await navAction.onKeyDown(makeEvent(3) as never);
			expect(sessionManager.openSession).toHaveBeenCalledWith(session);
		});

		it("does nothing when no session at nav slot", async () => {
			vi.mocked(sessionManager.getSessionForNavSlot).mockReturnValue(undefined);
			await navAction.onKeyDown(makeEvent(3) as never);
			expect(sessionManager.openSession).not.toHaveBeenCalled();
		});
	});
});
