import {
	action,
	type KeyDownEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import { sessionManager } from "../session-manager";
import { getCoords } from "./utils";

// Layout for 5x3 Stream Deck:
//   (0,0)=BACK  (1,0)=0  (2,0)=1  (3,0)=2  (4,0)=3
//   (0,1)=4     (1,1)=5  (2,1)=6  (3,1)=7  (4,1)=8
//   (0,2)=9     (1,2)=10 (2,2)=11 (3,2)=NAV (4,2)=NAV
function coordsToSlotIndex(col: number, row: number): number {
	if (row === 0) return col - 1;
	if (row === 1) return 4 + col;
	return 9 + col;
}

@action({ UUID: "com.aideck.aideck.session-slot" })
export class SessionSlotAction extends SingletonAction {
	override async onWillAppear(ev: WillAppearEvent): Promise<void> {
		const coords = getCoords(ev.payload as Record<string, unknown>);
		if (!coords) return;

		const slotIndex = coordsToSlotIndex(coords.column, coords.row);
		sessionManager.start();
		sessionManager.registerSlot(ev.action, slotIndex);
	}

	override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
		sessionManager.unregisterSlot(ev.action.id);
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		const coords = getCoords(ev.payload as Record<string, unknown>);
		if (!coords) return;

		const slotIndex = coordsToSlotIndex(coords.column, coords.row);
		const session = sessionManager.getSessionForSlot(slotIndex);
		if (session) {
			sessionManager.openSession(session);
		}
	}
}
