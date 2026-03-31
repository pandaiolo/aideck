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
		registerSlot: vi.fn(),
		unregisterSlot: vi.fn(),
		getSessionForSlot: vi.fn(),
		openSession: vi.fn(),
	},
}));

import { sessionManager } from "../session-manager";
import { SessionSlotAction } from "./session-slot";

function makeEvent(col: number, row: number, actionId = "a1") {
	return {
		action: { id: actionId, setImage: vi.fn().mockResolvedValue(undefined) },
		payload: { coordinates: { column: col, row: row } },
	};
}

function makeEventNoCoords(actionId = "a1") {
	return {
		action: { id: actionId, setImage: vi.fn().mockResolvedValue(undefined) },
		payload: {},
	};
}

describe("SessionSlotAction", () => {
	let slotAction: SessionSlotAction;

	beforeEach(() => {
		slotAction = new SessionSlotAction();
	});

	describe("onWillAppear (coordsToSlotIndex mapping)", () => {
		it("(1,0) → slot 0", async () => {
			await slotAction.onWillAppear(makeEvent(1, 0) as never);
			expect(sessionManager.registerSlot).toHaveBeenCalledWith(
				expect.anything(),
				0,
			);
		});

		it("(2,0) → slot 1", async () => {
			await slotAction.onWillAppear(makeEvent(2, 0) as never);
			expect(sessionManager.registerSlot).toHaveBeenCalledWith(
				expect.anything(),
				1,
			);
		});

		it("(3,0) → slot 2", async () => {
			await slotAction.onWillAppear(makeEvent(3, 0) as never);
			expect(sessionManager.registerSlot).toHaveBeenCalledWith(
				expect.anything(),
				2,
			);
		});

		it("(4,0) → slot 3", async () => {
			await slotAction.onWillAppear(makeEvent(4, 0) as never);
			expect(sessionManager.registerSlot).toHaveBeenCalledWith(
				expect.anything(),
				3,
			);
		});

		it("(0,1) → slot 4", async () => {
			await slotAction.onWillAppear(makeEvent(0, 1) as never);
			expect(sessionManager.registerSlot).toHaveBeenCalledWith(
				expect.anything(),
				4,
			);
		});

		it("(4,1) → slot 8", async () => {
			await slotAction.onWillAppear(makeEvent(4, 1) as never);
			expect(sessionManager.registerSlot).toHaveBeenCalledWith(
				expect.anything(),
				8,
			);
		});

		it("(0,2) → slot 9", async () => {
			await slotAction.onWillAppear(makeEvent(0, 2) as never);
			expect(sessionManager.registerSlot).toHaveBeenCalledWith(
				expect.anything(),
				9,
			);
		});

		it("(2,2) → slot 11", async () => {
			await slotAction.onWillAppear(makeEvent(2, 2) as never);
			expect(sessionManager.registerSlot).toHaveBeenCalledWith(
				expect.anything(),
				11,
			);
		});

		it("calls start on sessionManager", async () => {
			await slotAction.onWillAppear(makeEvent(1, 0) as never);
			expect(sessionManager.start).toHaveBeenCalled();
		});

		it("does nothing without coordinates", async () => {
			await slotAction.onWillAppear(makeEventNoCoords() as never);
			expect(sessionManager.registerSlot).not.toHaveBeenCalled();
		});
	});

	describe("onWillDisappear", () => {
		it("unregisters slot by action id", async () => {
			await slotAction.onWillDisappear(makeEvent(1, 0, "x1") as never);
			expect(sessionManager.unregisterSlot).toHaveBeenCalledWith("x1");
		});
	});

	describe("onKeyDown", () => {
		it("opens session when one exists at slot", async () => {
			const session = { sessionId: "s1" };
			vi.mocked(sessionManager.getSessionForSlot).mockReturnValue(
				session as never,
			);
			await slotAction.onKeyDown(makeEvent(1, 0) as never);
			expect(sessionManager.openSession).toHaveBeenCalledWith(session);
		});

		it("does not open when no session at slot", async () => {
			vi.mocked(sessionManager.getSessionForSlot).mockReturnValue(undefined);
			await slotAction.onKeyDown(makeEvent(1, 0) as never);
			expect(sessionManager.openSession).not.toHaveBeenCalled();
		});

		it("does nothing without coordinates", async () => {
			await slotAction.onKeyDown(makeEventNoCoords() as never);
			expect(sessionManager.getSessionForSlot).not.toHaveBeenCalled();
		});
	});
});
