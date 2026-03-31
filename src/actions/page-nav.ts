import {
	action,
	type KeyDownEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import { sessionManager } from "../session-manager";
import { getCoords } from "./utils";

function coordsToDirection(col: number): "prev" | "next" {
	return col === 3 ? "prev" : "next";
}

@action({ UUID: "com.aideck.aideck.page-nav" })
export class PageNavAction extends SingletonAction {
	override async onWillAppear(ev: WillAppearEvent): Promise<void> {
		const coords = getCoords(ev.payload as Record<string, unknown>);
		if (!coords) return;

		const direction = coordsToDirection(coords.column);
		sessionManager.start();
		sessionManager.registerNav(ev.action, direction);
	}

	override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
		const coords = getCoords(ev.payload as Record<string, unknown>);
		if (!coords) return;

		const direction = coordsToDirection(coords.column);
		sessionManager.unregisterNav(direction);
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		const coords = getCoords(ev.payload as Record<string, unknown>);
		if (!coords) return;

		const direction = coordsToDirection(coords.column);

		if (sessionManager.isSinglePanel) {
			const session = sessionManager.getSessionForNavSlot(direction);
			if (session) sessionManager.openSession(session);
		} else {
			if (direction === "prev") {
				sessionManager.prevPage();
			} else {
				sessionManager.nextPage();
			}
		}
	}
}
